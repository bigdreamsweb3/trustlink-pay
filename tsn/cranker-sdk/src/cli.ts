import "dotenv/config";

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { Keypair, PublicKey } from "@solana/web3.js";

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
  const raw = JSON.parse(readFileSync(resolvePath(path), "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function operatorKeypair() {
  return loadKeypair(process.env.KEYPAIR_PATH ?? "./cranker-keypair.json");
}

function authorityKeypair() {
  return loadKeypair(
    process.env.TSN_AUTHORITY_KEYPAIR_PATH ??
      process.env.KEYPAIR_PATH ??
      "./cranker-keypair.json",
  );
}

function parseBoolean(value: string | undefined) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("Expected true or false");
}

async function handleCommand() {
  const command = process.argv[2];

  // Dynamically import setup functions - late import to avoid rootDir issues
  // Using any to bypass type checking of parent package imports at compile time
  // These functions are resolved at runtime
  const module: any = await import("../../src/blockchain/solana-tsn.js");
  const {
    sha256Bytes,
    tsnInitializeMotherEscrowOnChain,
    tsnRegisterCrankerOnChain,
    tsnSetCrankerFundingPolicyOnChain,
    tsnInitializeCrankerVaultOnChain,
    tsnFundCrankerOnChain,
    tsnWithdrawCrankerFundsOnChain,
    tsnSettleEpochOnChain,
  } = module;

  if (command === "init-mother") {
    const result = await tsnInitializeMotherEscrowOnChain({
      authority: authorityKeypair(),
      protocolSeed32: sha256Bytes("tsn-dev-seed"),
      epochSeconds: BigInt(7 * 60 * 60),
      leaseSeconds: BigInt(30),
      feeSplitCrankerBps: null,
      feeSplitLpBps: null,
      feeSplitTreasuryBps: null,
    });
    console.log(result);
    return;
  }

  if (command === "register-cranker") {
    console.log(
      await tsnRegisterCrankerOnChain({ operator: operatorKeypair() }),
    );
    return;
  }

  if (command === "set-funding-policy") {
    console.log(
      await tsnSetCrankerFundingPolicyOnChain({
        operator: operatorKeypair(),
        allowExternalFunding: parseBoolean(process.argv[3]),
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
      }),
    );
    return;
  }

  if (command === "settle-epoch") {
    console.log(
      await tsnSettleEpochOnChain({
        authority: authorityKeypair(),
        force: process.argv[3] === "--force",
      }),
    );
    return;
  }

  console.error(`Unknown command: ${command ?? "(missing)"}`);
  console.error(`Usage:
  npm start -- init-mother
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
    console.log("[cranker-sdk] Ready for setup commands");
    console.log(
      "Usage: npm start -- <command> [args]\nRun 'npm start -- --help' for setup commands",
    );
    return;
  }

  if (command === "--help" || command === "help") {
    console.log(`TSN Cranker SDK Setup Commands:
    
  init-mother                    Initialize mother escrow on chain
  register-cranker               Register operator as cranker
  set-funding-policy <bool>      Set cranker funding policy (true|false)
  init-vault <TOKEN_MINT>        Initialize cranker vault
  fund-cranker <TOKEN_MINT> <FUNDER_KEYPAIR> <FUNDER_TOKEN_ACCT> <AMOUNT>
  withdraw-cranker <TOKEN_MINT> <FUNDER_KEYPAIR> <FUNDER_TOKEN_ACCT> <AMOUNT>
  settle-epoch [--force]         Settle current epoch
  
Environment Variables:
  RPC_URL                        Solana RPC endpoint
  PROGRAM_ID                     TSN program ID
  KEYPAIR_PATH                   Path to operator keypair (default: ./cranker-keypair.json)
  TSN_AUTHORITY_KEYPAIR_PATH     Path to authority keypair (for init-mother)`);
    return;
  }

  await handleCommand();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
