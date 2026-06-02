import { config as loadDotenv } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { Keypair, PublicKey } from "@solana/web3.js";

import {
  sha256Bytes,
  tsnInitializeMotherEscrowOnChain,
  tsnMigrateMotherEscrowOnChain,
  tsnRegisterCrankerOnChain,
  tsnSetCrankerFundingPolicyOnChain,
  tsnInitializeCrankerVaultOnChain,
  tsnFundCrankerOnChain,
  tsnWithdrawCrankerFundsOnChain,
  tsnSettleEpochOnChain,
} from "../../tsn-sdk/dist/blockchain/solana-tsn.js";

loadDotenv();
loadDotenv({ path: ".env.local", override: true });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function resolvePath(path: string) {
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return resolve(process.cwd(), path);
}

function loadKeypair(path: string) {
  const resolved = resolvePath(path);
  if (!existsSync(resolved)) {
    throw new Error(
      `Keypair not found at ${resolved}. Set KEYPAIR_PATH to the JSON keypair that should sign this command.`,
    );
  }
  const raw = JSON.parse(readFileSync(resolved, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function operatorKeypair() {
  return loadKeypair(process.env.KEYPAIR_PATH ?? "./cranker-keypair.json");
}

function authorityKeypair() {
  return loadKeypair(process.env.KEYPAIR_PATH ?? "./cranker-keypair.json");
}

function tinsProgramId() {
  return new PublicKey(process.env.TINS_PROGRAM_ID ?? "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT");
}

function parseBoolean(value: string | undefined) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("Expected true or false");
}

async function handleCommand() {
  const command = process.argv[2];
  const rpcUrl = process.env.RPC_URL;
  const secretKey = process.env.SOLANA_ESCROW_AUTHORITY_SECRET_KEY ?? process.env.SOLANA_CLAIM_VERIFIER_SECRET_KEY;

  if (command === "init-mother") {
    const result = await tsnInitializeMotherEscrowOnChain({
      authority: authorityKeypair(),
      tinsProgramId: tinsProgramId(),
      protocolSeed32: sha256Bytes("tsn-dev-seed"),
      epochSeconds: BigInt(7 * 60 * 60),
      leaseSeconds: BigInt(30),
      feeSplitCrankerBps: null,
      feeSplitLpBps: null,
      feeSplitTreasuryBps: null,
      rpcUrl,
      secretKey,
    });
    console.log(result);
    return;
  }

  if (command === "migrate-mother") {
    const result = await tsnMigrateMotherEscrowOnChain({
      authority: authorityKeypair(),
      tinsProgramId: tinsProgramId(),
      protocolSeed32: sha256Bytes("tsn-dev-seed"),
      epochSeconds: BigInt(7 * 60 * 60),
      leaseSeconds: BigInt(30),
      feeSplitCrankerBps: null,
      feeSplitLpBps: null,
      feeSplitTreasuryBps: null,
      rpcUrl,
      secretKey,
    });
    console.log(result);
    return;
  }

  if (command === "register-cranker") {
    console.log(
      await tsnRegisterCrankerOnChain({
        operator: operatorKeypair(),
        rpcUrl,
        secretKey,
      }),
    );
    return;
  }

  if (command === "set-funding-policy") {
    console.log(
      await tsnSetCrankerFundingPolicyOnChain({
        operator: operatorKeypair(),
        allowExternalFunding: parseBoolean(process.argv[3]),
        rpcUrl,
      }),
    );
    return;
  }

  if (command === "init-vault") {
    const operator = operatorKeypair();
    console.log(
      await tsnInitializeCrankerVaultOnChain({
        payer: operator,
        operator: operator.publicKey,
        tokenMint: new PublicKey(process.argv[3]),
        rpcUrl,
        secretKey,
      }),
    );
    return;
  }

  if (command === "fund-cranker") {
    const operator = operatorKeypair();
    console.log(
      await tsnFundCrankerOnChain({
        funder: loadKeypair(process.argv[4]),
        operator: operator.publicKey,
        tokenMint: new PublicKey(process.argv[3]),
        funderTokenAccount: new PublicKey(process.argv[5]),
        amountBaseUnits: BigInt(process.argv[6]),
        rpcUrl,
      }),
    );
    return;
  }

  if (command === "withdraw-cranker") {
    const operator = operatorKeypair();
    console.log(
      await tsnWithdrawCrankerFundsOnChain({
        funder: loadKeypair(process.argv[4]),
        operator: operator.publicKey,
        tokenMint: new PublicKey(process.argv[3]),
        funderTokenAccount: new PublicKey(process.argv[5]),
        amountBaseUnits: BigInt(process.argv[6]),
        rpcUrl,
      }),
    );
    return;
  }

  if (command === "settle-epoch") {
    console.log(
      await tsnSettleEpochOnChain({
        authority: authorityKeypair(),
        force: process.argv[3] === "--force",
        rpcUrl,
        secretKey,
      }),
    );
    return;
  }

  console.error(`Unknown command: ${command ?? "(missing)"}`);
  console.error(`Usage:
  npm start -- init-mother
  npm start -- migrate-mother
  npm start -- register-cranker
  npm start -- set-funding-policy true|false
  npm start -- init-vault <TOKEN_MINT>
  npm start -- fund-cranker <TOKEN_MINT> <FUNDER_KEYPAIR_PATH> <FUNDER_TOKEN_ACCOUNT> <AMOUNT_BASE_UNITS>
  npm start -- withdraw-cranker <TOKEN_MINT> <FUNDER_KEYPAIR_PATH> <FUNDER_TOKEN_ACCOUNT> <AMOUNT_BASE_UNITS>
  npm start -- settle-epoch [--force]`);
  process.exit(1);
}

async function main() {
  const command = process.argv[2];

  if (!command) {
    requireEnv("RPC_URL");
    requireEnv("PROGRAM_ID");
    console.log("[tsn-cranker-sdk] Ready for setup commands");
    console.log(
      "Usage: npm start -- <command> [args]\nRun 'npm start -- --help' for setup commands",
    );
    return;
  }

  if (command === "--help" || command === "help") {
    console.log(`TSN Cranker SDK Setup Commands:
    
  init-mother                    Initialize mother escrow on chain
  migrate-mother                 Rewrite an invalid/old mother escrow layout
  register-cranker               Register operator as cranker
  set-funding-policy <bool>      Set cranker funding policy (true|false)
  init-vault <TOKEN_MINT>        Initialize cranker vault
  fund-cranker <TOKEN_MINT> <FUNDER_KEYPAIR> <FUNDER_TOKEN_ACCT> <AMOUNT>
  withdraw-cranker <TOKEN_MINT> <FUNDER_KEYPAIR> <FUNDER_TOKEN_ACCT> <AMOUNT>
  settle-epoch [--force]         Settle current epoch
  
Environment Variables:
  RPC_URL                        Solana RPC endpoint
  PROGRAM_ID                     TSN program ID
  TINS_PROGRAM_ID                TINS registry program ID (defaults to local dev TINS id)
  KEYPAIR_PATH                   Path to signer/operator keypair (default: ./cranker-keypair.json)`);
    return;
  }

  await handleCommand();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
