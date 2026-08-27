import { createHash } from "node:crypto";
import { PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { run as adminRun } from "../../tcap-protocol/scripts/tcap-asset-admin.mjs";
import { connection, parseOptions, inspect, assetForMint, keypairPath, loadKeypair } from "./common.mjs";

const cliOptions = parseOptions(process.argv.slice(2));
const options = { ...cliOptions, mint: cliOptions.mint ?? process.env.npm_config_mint, confirm: cliOptions.confirm ?? process.env.npm_config_confirm };
const mint = options.mint;
if (!mint) throw new Error("Usage: npm run network:init-asset -- --mint=<devnet mint> [--confirm]");
const signer = loadKeypair(keypairPath(options)); const live = await inspect(connection(), mint);
if (live.mint.decimals !== 6) throw new Error(`WRONG_MINT_DECIMALS: ${mint} has ${live.mint.decimals}; Devnet USDC must have 6`);
if (live.config.governanceAuthority !== signer.publicKey.toBase58()) throw new Error(`GOVERNANCE_AUTHORITY_MISMATCH: config requires ${live.config.governanceAuthority}, supplied ${signer.publicKey.toBase58()}`);
if (live.config.registryAuthority !== signer.publicKey.toBase58()) {
  if (!options.confirm) throw new Error(`TCAP_CONFIG_AUTHORITY_REPAIR_REQUIRED: registry authority is ${live.config.registryAuthority}; rerun with --confirm to submit governance-only migrate_tcap_config_layout_v1`);
  const config = new PublicKey(live.addresses.config);
  const data = createHash("sha256").update("global:migrate_tcap_config_layout_v1").digest().subarray(0, 8);
  const repair = new TransactionInstruction({ programId: live.program.address ? new PublicKey(live.program.address) : new PublicKey("TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x"), keys: [
    { pubkey: signer.publicKey, isSigner: true, isWritable: true }, { pubkey: config, isSigner: false, isWritable: true }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ], data });
  const signature = await sendAndConfirmTransaction(connection(), new Transaction().add(repair), [signer], { commitment: "confirmed" });
  console.log(`Repaired TCAP config registry authority via governance migration: ${signature}`);
}
const args = ["register", "--mint", mint, "--mint-profile", "standard-public", "--asset-commitment", createHash("sha256").update(`trustlink-devnet-asset-v2:${mint}`).digest("hex"), "--governance-approval", createHash("sha256").update(`trustlink-devnet-governance-v2:${mint}`).digest("hex"), "--governance-keypair", keypairPath(options), "--cluster", "devnet"];
if (options.confirm) args.push("--confirm");
console.log(`Devnet governance initialization for mint ${mint}; signer=${signer.publicKey.toBase58()}`);
const result = await adminRun(args); console.log(JSON.stringify(result, null, 2));
if (String(result.status) === "CONFIRMED_AND_VERIFIED") {
  for (const command of ["approve", "initialize-reserve", "initialize-vault", "activate", "enable-deposits"]) {
    const followup = [command, "--mint", mint, "--governance-keypair", keypairPath(options), "--cluster", "devnet", "--confirm"];
    const output = await adminRun(followup); console.log(JSON.stringify(output, null, 2));
    if (output.status !== "CONFIRMED_AND_VERIFIED" && !output.idempotent) throw new Error(`GOVERNANCE_STEP_FAILED: ${command}`);
  }
}
if (!String(result.status).includes("CONFIRMED") && !String(result.status).includes("SIMULATION")) process.exitCode = 2;
