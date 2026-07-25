import fs from "node:fs";
import os from "node:os";
import { createHash } from "node:crypto";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";

const [mintText] = process.argv.slice(2);
if (!mintText) throw new Error("Usage: node scripts/devnet-initialize-vault.mjs <mint>");
const PROGRAM_ID = new PublicKey("TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const RPC = process.env.TCAP_RPC_URL ?? "https://api.devnet.solana.com";
const walletPath = process.env.SOLANA_WALLET ?? `${os.homedir()}/.config/solana/id.json`;
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))));
const connection = new Connection(RPC, "confirmed");
const seed = (v) => Buffer.from(v, "utf8");
const mint = new PublicKey(mintText);
const [config] = PublicKey.findProgramAddressSync([seed("tcap:global-config:v1")], PROGRAM_ID);
const [registry] = PublicKey.findProgramAddressSync([seed("tcap:asset-registry:v1")], PROGRAM_ID);
const [assetEntry] = PublicKey.findProgramAddressSync([seed("tcap:asset-entry:v1"), registry.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()], PROGRAM_ID);
const [reserveState] = PublicKey.findProgramAddressSync([seed("tcap:reserve-state:v1"), assetEntry.toBytes()], PROGRAM_ID);
const [reserveAuthority] = PublicKey.findProgramAddressSync([seed("tcap:reserve-authority:v1"), assetEntry.toBytes()], PROGRAM_ID);
const [vault] = PublicKey.findProgramAddressSync([seed("tcap:future-vault:v1"), assetEntry.toBytes()], PROGRAM_ID);
const discriminator = createHash("sha256").update("global:initialize_reserve_vault_v1").digest().subarray(0, 8);
const ix = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: config, isSigner: false, isWritable: false },
    { pubkey: assetEntry, isSigner: false, isWritable: false },
    { pubkey: reserveState, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: reserveAuthority, isSigner: false, isWritable: false },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: discriminator,
});
const signature = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer], { commitment: "confirmed" });
console.log(`Canonical vault: ${vault.toBase58()}`);
console.log(`Signature: ${signature}`);
