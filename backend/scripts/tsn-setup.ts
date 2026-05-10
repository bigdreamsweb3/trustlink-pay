import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Keypair, PublicKey } from "@solana/web3.js";

config({ path: ".env.local" });

async function loadKeypairFromFile(path: string) {
  const raw = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function resolveKeypairPath(path: string) {
  return resolve(process.cwd(), path);
}

async function loadDefaultCrankerKeypair() {
  const keypairPath = process.env.TSN_CRANKER_KEYPAIR_PATH ?? "./cranker-keypair.json";
  return loadKeypairFromFile(resolveKeypairPath(keypairPath));
}

async function resolveOperatorPubkey(value?: string) {
  if (value) return new PublicKey(value);
  return (await loadDefaultCrankerKeypair()).publicKey;
}

function parseBoolean(value: string | undefined) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("Expected true or false");
}

async function main() {
  const cmd = process.argv[2];
  const {
    sha256Bytes,
    getTsnMotherEscrowPda,
    tsnFundCrankerOnChain,
    tsnFetchMotherEscrowOnChain,
    tsnInitializeCrankerVaultOnChain,
    tsnInitializeMotherEscrowOnChain,
    tsnMigrateMotherEscrowOnChain,
    tsnRegisterCrankerOnChain,
    tsnSetCrankerFundingPolicyOnChain,
    tsnSettleEpochOnChain,
    tsnWithdrawCrankerFundsOnChain,
  } = await import("../app/blockchain/solana");

  if (cmd === "status") {
    const motherEscrow = getTsnMotherEscrowPda();
    const state = await tsnFetchMotherEscrowOnChain();
    console.log({
      motherEscrow: motherEscrow.toBase58(),
      state,
    });
    return;
  }

  if (cmd === "init-mother") {
    const authority = await loadDefaultCrankerKeypair();
    const seed = sha256Bytes("tsn-dev-seed");
    const result = await tsnInitializeMotherEscrowOnChain({
      authority,
      protocolSeed32: seed,
      epochSeconds: BigInt(7 * 60 * 60),
      leaseSeconds: BigInt(30),
      feeSplitCrankerBps: null,
      feeSplitLpBps: null,
      feeSplitTreasuryBps: null,
    });
    console.log(result);
    return;
  }

  if (cmd === "migrate-mother") {
    const authority = await loadDefaultCrankerKeypair();
    const seed = sha256Bytes("tsn-dev-seed");
    const result = await tsnMigrateMotherEscrowOnChain({
      authority,
      protocolSeed32: seed,
      epochSeconds: BigInt(7 * 60 * 60),
      leaseSeconds: BigInt(30),
      feeSplitCrankerBps: null,
      feeSplitLpBps: null,
      feeSplitTreasuryBps: null,
    });
    console.log(result);
    return;
  }

  if (cmd === "register-cranker") {
    const operator = await loadDefaultCrankerKeypair();
    const result = await tsnRegisterCrankerOnChain({ operator });
    console.log(result);
    return;
  }

  if (cmd === "set-funding-policy") {
    const operator = await loadDefaultCrankerKeypair();
    const allowExternalFunding = parseBoolean(process.argv[3]);
    const result = await tsnSetCrankerFundingPolicyOnChain({ operator, allowExternalFunding });
    console.log(result);
    return;
  }

  if (cmd === "init-vault") {
    const tokenMint = new PublicKey(process.argv[3]);
    const payer = await loadDefaultCrankerKeypair();
    const operator = process.argv[4] ? await resolveOperatorPubkey(process.argv[4]) : payer.publicKey;
    const result = await tsnInitializeCrankerVaultOnChain({ payer, operator, tokenMint });
    console.log(result);
    return;
  }

  if (cmd === "fund-cranker") {
    const tokenMint = new PublicKey(process.argv[3]);
    const funder = await loadKeypairFromFile(resolveKeypairPath(process.argv[4]));
    const funderTokenAccount = new PublicKey(process.argv[5]);
    const amountBaseUnits = BigInt(process.argv[6]);
    const operator = await resolveOperatorPubkey(process.argv[7]);
    const result = await tsnFundCrankerOnChain({
      funder,
      operator,
      tokenMint,
      funderTokenAccount,
      amountBaseUnits,
    });
    console.log(result);
    return;
  }

  if (cmd === "withdraw-cranker") {
    const tokenMint = new PublicKey(process.argv[3]);
    const funder = await loadKeypairFromFile(resolveKeypairPath(process.argv[4]));
    const funderTokenAccount = new PublicKey(process.argv[5]);
    const amountBaseUnits = BigInt(process.argv[6]);
    const operator = await resolveOperatorPubkey(process.argv[7]);
    const result = await tsnWithdrawCrankerFundsOnChain({
      funder,
      operator,
      tokenMint,
      funderTokenAccount,
      amountBaseUnits,
    });
    console.log(result);
    return;
  }

  if (cmd === "settle-epoch") {
    const force = process.argv[3] === "--force";
    const result = await tsnSettleEpochOnChain({ force });
    console.log(result);
    return;
  }

  console.error(`Unknown command: ${cmd ?? "(missing)"}`);
  console.error(`Usage:
  tsx scripts/tsn-setup.ts status
  tsx scripts/tsn-setup.ts init-mother
  tsx scripts/tsn-setup.ts migrate-mother
  tsx scripts/tsn-setup.ts register-cranker
  tsx scripts/tsn-setup.ts set-funding-policy true|false
  tsx scripts/tsn-setup.ts init-vault <TOKEN_MINT> [OPERATOR_PUBKEY]
  tsx scripts/tsn-setup.ts fund-cranker <TOKEN_MINT> <FUNDER_KEYPAIR_PATH> <FUNDER_TOKEN_ACCOUNT> <AMOUNT_BASE_UNITS> [OPERATOR_PUBKEY]
  tsx scripts/tsn-setup.ts withdraw-cranker <TOKEN_MINT> <FUNDER_KEYPAIR_PATH> <FUNDER_TOKEN_ACCOUNT> <AMOUNT_BASE_UNITS> [OPERATOR_PUBKEY]
  tsx scripts/tsn-setup.ts settle-epoch [--force]`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
