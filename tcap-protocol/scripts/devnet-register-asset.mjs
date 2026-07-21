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

const [mintText] = process.argv.slice(2);
if (!mintText) throw new Error("Usage: node scripts/devnet-register-asset.mjs <mint>");

const PROGRAM_ID = new PublicKey("TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const RPC = process.env.TCAP_RPC_URL ?? "https://api.devnet.solana.com";
const walletPath = process.env.SOLANA_WALLET ?? `${os.homedir()}/.config/solana/id.json`;
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))));
const connection = new Connection(RPC, "confirmed");
const mint = new PublicKey(mintText);
const seed = (value) => Buffer.from(value, "utf8");
const digest = (value) => createHash("sha256").update(value).digest();
const [registry] = PublicKey.findProgramAddressSync([seed("tcap:asset-registry:v1")], PROGRAM_ID);
const [assetEntry] = PublicKey.findProgramAddressSync(
  [seed("tcap:asset-entry:v1"), registry.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
  PROGRAM_ID,
);
const [config] = PublicKey.findProgramAddressSync([seed("tcap:global-config:v1")], PROGRAM_ID);

if (await connection.getAccountInfo(assetEntry)) {
  console.log(`Asset entry already exists: ${assetEntry.toBase58()}`);
  process.exit(0);
}

const data = Buffer.alloc(8 + 32 + 1 + 1 + 1 + 32);
createHash("sha256").update("global:register_asset_v1").digest().subarray(0, 8).copy(data, 0);
digest(`trustlink-devnet-asset:${mint.toBase58()}`).copy(data, 8);
data.writeUInt8(0, 40);
data.writeUInt8(0, 41);
data.writeUInt8(0, 42);
digest(`trustlink-devnet-governance:${mint.toBase58()}`).copy(data, 43);

const ix = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: config, isSigner: false, isWritable: false },
    { pubkey: registry, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: assetEntry, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data,
});

const signature = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer], {
  commitment: "confirmed",
});
console.log(`Mint: ${mint.toBase58()}`);
console.log(`Asset entry PDA: ${assetEntry.toBase58()}`);
console.log(`Signature: ${signature}`);
