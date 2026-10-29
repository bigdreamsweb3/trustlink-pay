import fs from "node:fs";
import os from "node:os";
import { createHash } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF");
const TSN_ID = new PublicKey("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");
const anchorConfig = fs.readFileSync(new URL("../Anchor.toml", import.meta.url), "utf8");
const anchorRpc = anchorConfig.match(/^cluster\s*=\s*"([^"]+)"/m)?.[1];
const anchorWallet = anchorConfig.match(/^wallet\s*=\s*"([^"]+)"/m)?.[1];
const RPC = anchorRpc ?? process.env.TCAP_RPC_URL ?? process.env.ANCHOR_PROVIDER_URL ?? process.env.SOLANA_RPC_URL;
if (!RPC) throw new Error("No Devnet RPC configured in tsn-protocol/programs/tcap-protocol/Anchor.toml");
const configuredWallet = process.env.SOLANA_WALLET ?? anchorWallet ?? `${os.homedir()}/.config/solana/id.json`;
const walletPath = configuredWallet.startsWith("~/")
  ? `${os.homedir()}/${configuredWallet.slice(2)}`
  : configuredWallet;
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))));
const connection = new Connection(RPC, "confirmed");

const seed = (value) => Buffer.from(value, "utf8");
const [config] = PublicKey.findProgramAddressSync([seed("tcap:global-config:v1")], PROGRAM_ID);
const [registry] = PublicKey.findProgramAddressSync([seed("tcap:asset-registry:v1")], PROGRAM_ID);
const [root] = PublicKey.findProgramAddressSync([seed("tcap:commitment-root:v1")], PROGRAM_ID);

function pubkeyBytes(value) {
  return Buffer.from(new PublicKey(value).toBytes());
}

function initializeTcapInstruction() {
  const data = Buffer.alloc(8 + 2 + 32 + 32 + 32 + 2);
  Buffer.from([86, 134, 87, 194, 207, 167, 196, 106]).copy(data, 0);
  data.writeUInt16LE(1, 8);
  pubkeyBytes(payer.publicKey).copy(data, 10);
  pubkeyBytes(payer.publicKey).copy(data, 42);
  pubkeyBytes(TSN_ID).copy(data, 74);
  data.writeUInt16LE(1, 106);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: TSN_ID, isSigner: false, isWritable: false },
      { pubkey: registry, isSigner: false, isWritable: false },
      { pubkey: root, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function initializeRegistryInstruction() {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: registry, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([38, 163, 178, 153, 20, 54, 86, 90]),
  });
}

function initializeCommitmentRootInstruction() {
  const data = Buffer.alloc(8 + 32);
  createHash("sha256")
    .update("global:initialize_commitment_root_v1")
    .digest()
    .subarray(0, 8)
    .copy(data, 0);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: root, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

const configInfo = await connection.getAccountInfo(config);
const registryInfo = await connection.getAccountInfo(registry);
const rootInfo = await connection.getAccountInfo(root);
const instructions = [];

if (!configInfo) {
  instructions.push(initializeTcapInstruction());
}

if (!registryInfo) instructions.push(initializeRegistryInstruction());
if (!rootInfo) {
  instructions.push(initializeCommitmentRootInstruction());
} else {
  const rootData = rootInfo.data;
  if (rootData.length !== 124) {
    throw new Error(`Unexpected TCAP commitment root account size: ${rootData.length}`);
  }
  const sequence = rootData.readBigUInt64LE(80);
  const currentRoot = rootData.subarray(12, 44);
  const isPaused = rootData[122] !== 0;
  if (sequence === 0n && currentRoot.every((byte) => byte === 0)) {
    const data = createHash("sha256")
      .update("global:activate_commitment_root_v1")
      .digest()
      .subarray(0, 8);
    instructions.push(new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: root, isSigner: false, isWritable: true },
      ],
      data,
    }));
  } else if (isPaused) {
    console.warn("TCAP commitment root is paused with existing state; setup will not unpause it.");
  }
}

if (instructions.length === 0) {
  console.log(`TCAP is initialized: ${PROGRAM_ID.toBase58()}`);
  console.log(`Config PDA: ${config.toBase58()}`);
  console.log(`Registry PDA: ${registry.toBase58()}`);
  console.log(`Commitment root PDA: ${root.toBase58()}`);
  process.exit(0);
}

const tx = new Transaction().add(...instructions);
const signature = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
console.log(`TCAP initialized on devnet: ${PROGRAM_ID.toBase58()}`);
console.log(`Config PDA: ${config.toBase58()}`);
console.log(`Registry PDA: ${registry.toBase58()}`);
console.log(`Commitment root PDA: ${root.toBase58()}`);
console.log(`Signature: ${signature}`);
