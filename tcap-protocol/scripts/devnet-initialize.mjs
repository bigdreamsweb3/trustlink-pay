import fs from "node:fs";
import os from "node:os";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x");
const TSN_ID = new PublicKey("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");
const RPC = process.env.TCAP_RPC_URL ?? "https://api.devnet.solana.com";
const walletPath = process.env.SOLANA_WALLET ?? `${os.homedir()}/.config/solana/id.json`;
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

const configInfo = await connection.getAccountInfo(config);
if (configInfo) {
  console.log(`TCAP config already initialized: ${config.toBase58()}`);
  process.exit(0);
}

const tx = new Transaction().add(initializeTcapInstruction(), initializeRegistryInstruction());
const signature = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
console.log(`TCAP initialized on devnet: ${PROGRAM_ID.toBase58()}`);
console.log(`Config PDA: ${config.toBase58()}`);
console.log(`Registry PDA: ${registry.toBase58()}`);
console.log(`Signature: ${signature}`);
