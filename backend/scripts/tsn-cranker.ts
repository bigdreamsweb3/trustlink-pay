import { config } from "dotenv";
import { randomBytes, createCipheriv, createHash } from "crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Keypair, PublicKey } from "@solana/web3.js";

config({ path: ".env.local" });

function loadKeypairFromFile(path: string) {
  const raw = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function deriveAesKeyFromSecretKey(secretKey: Uint8Array): Buffer {
  return createHash("sha256").update(Buffer.from(secretKey)).digest(); // 32 bytes
}

function encryptPayload(key: Buffer, payload: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const {
    env,
  } = await import("../app/lib/env");
  if (!env.TSN_ENABLED) {
    throw new Error("TSN is not enabled (set TSN_ENABLED=true)");
  }

  const { listPendingIntentsWithClaimRequests, updateClaimRequestStatus, updatePaymentIntentStatus } =
    await import("../app/db/tsn");
  const { markPaymentClaimed } = await import("../app/db/payments");
  const { findPaymentById } = await import("../app/db/payments");
  const {
    estimateTsnClaimNetworkFeeLamports,
    getEscrowConfigState,
    getTsnIntentPda,
    getTsnMotherEscrowPda,
    tsnCreateIntentOnChain,
    tsnFetchIntentOnChain,
    tsnFetchMotherEscrowOnChain,
    tsnClaimIntentOnChain,
    tsnSubmitProofOnChain,
  } = await import("../app/blockchain/solana");
  const { fromBaseUnits, getAllowedTokenByMint, getTokenAndSolUsdPrices, lamportsToSol, roundUpToDecimals, toBaseUnits } =
    await import("../app/blockchain/solana-core");
  const { getEscrowPolicyConfig } = await import("../app/config/escrow");

  const keypairPath = process.env.TSN_CRANKER_KEYPAIR_PATH ?? "./cranker-keypair.json";
  const operator = loadKeypairFromFile(resolve(process.cwd(), keypairPath));
  const ledgerPath = resolve(process.cwd(), ".cranker-ledger-encrypted.jsonl");
  const aesKey = deriveAesKeyFromSecretKey(operator.secretKey);

  const motherEscrow: PublicKey = getTsnMotherEscrowPda();
  const motherEscrowState = await tsnFetchMotherEscrowOnChain();
  if (!motherEscrowState) {
    throw new Error(
      `TSN mother escrow ${motherEscrow.toBase58()} is not initialized on-chain. Run \`npm run tsn:setup -- init-mother\` after deploying the TSN-enabled program.`,
    );
  }
  if (!motherEscrowState.valid) {
    throw new Error(
      `TSN mother escrow ${motherEscrow.toBase58()} is unreadable on-chain (${motherEscrowState.reason}). Redeploy the TSN-enabled program and re-run \`npm run tsn:setup -- init-mother\`.`,
    );
  }

  console.log(`[tsn-cranker] operator=${operator.publicKey.toBase58()}`);
  console.log(`[tsn-cranker] ledger=${ledgerPath}`);
  console.log(`[tsn-cranker] mother-escrow=${motherEscrowState.address}`);

  while (true) {
    const work = await listPendingIntentsWithClaimRequests(20);
    for (const item of work) {
      const intentSeed32 = Buffer.from(item.intent.intent_seed_hash, "hex");
      const intentPda = getTsnIntentPda({ motherEscrow, intentSeed32 });

      try {
        if (!item.intent.token_mint_address || !item.destinationWallet) {
          throw new Error("Missing token mint or destination wallet for TSN payout");
        }

        await updateClaimRequestStatus({ id: item.claimRequestId, status: "processing" });
        const tokenConfig = getAllowedTokenByMint(item.intent.token_mint_address);
        if (!tokenConfig) {
          throw new Error("Token mint not allowlisted for TSN payout");
        }

        const tokenMint = new PublicKey(item.intent.token_mint_address);
        const recipientWallet = new PublicKey(item.destinationWallet);
        const grossAmountUi = Number(item.intent.amount);
        const grossAmountBaseUnits = toBaseUnits(grossAmountUi, tokenConfig.decimals);
        const estimatedNetworkFeeLamports = await estimateTsnClaimNetworkFeeLamports({
          intent: intentPda,
          tokenMint,
          recipientWallet,
        });
        const [prices, escrowConfig] = await Promise.all([
          getTokenAndSolUsdPrices(tokenConfig.symbol),
          getEscrowConfigState(),
        ]);
        const fallbackPolicy = getEscrowPolicyConfig();
        const claimFeeBps = escrowConfig?.claimFeeBps ?? fallbackPolicy.claimFeeBps;
        const claimFeeMaxUiAmount = escrowConfig?.claimFeeMaxUiAmount ?? fallbackPolicy.claimFeeMaxUiAmount;
        const claimFeeMaxUsd = fallbackPolicy.claimFeeMaxUsd;
        const coveredNetworkFeeUsd =
          prices.solUsd != null ? lamportsToSol(estimatedNetworkFeeLamports) * prices.solUsd * env.TRUSTLINK_FEE_COVERAGE_TX_COUNT : null;
        const uncappedMarginUsd =
          coveredNetworkFeeUsd != null ? (coveredNetworkFeeUsd * claimFeeBps) / 10_000 : null;
        const marginUsd =
          uncappedMarginUsd != null
            ? claimFeeMaxUsd > 0
              ? Math.min(uncappedMarginUsd, claimFeeMaxUsd)
              : uncappedMarginUsd
            : null;
        const claimFeeAmountUi =
          coveredNetworkFeeUsd != null && marginUsd != null && prices.tokenUsd != null && prices.tokenUsd > 0
            ? roundUpToDecimals(
                claimFeeMaxUiAmount > 0
                  ? Math.min((coveredNetworkFeeUsd + marginUsd) / prices.tokenUsd, claimFeeMaxUiAmount)
                  : (coveredNetworkFeeUsd + marginUsd) / prices.tokenUsd,
                tokenConfig.decimals,
              )
            : 0;
        const claimFeeAmountBaseUnits = toBaseUnits(claimFeeAmountUi, tokenConfig.decimals);
        const payoutAmountBaseUnits =
          grossAmountBaseUnits > claimFeeAmountBaseUnits ? grossAmountBaseUnits - claimFeeAmountBaseUnits : 0n;
        const payoutAmountUi = fromBaseUnits(payoutAmountBaseUnits, tokenConfig.decimals);

        const onchainIntent = await tsnFetchIntentOnChain({ intent: intentPda });
        if (!onchainIntent) {
          if (!env.TSN_CREATE_INTENTS_ONCHAIN) {
            throw new Error(
              "TSN intent is missing on-chain. Enable TSN_CREATE_INTENTS_ONCHAIN or backfill intents before running the cranker.",
            );
          }

          const payment = await findPaymentById(item.intent.payment_id);
          if (!payment?.escrow_account) {
            throw new Error("Cannot backfill TSN intent on-chain: missing payment escrow_account");
          }

          await tsnCreateIntentOnChain({
            payer: operator,
            intentSeed32,
            underlyingPayment: new PublicKey(payment.escrow_account),
            tokenMint,
            amountBaseUnits: grossAmountBaseUnits,
            recipientHash32: Buffer.from(item.intent.recipient_hash, "hex"),
          });
        }

        const claimTx = await tsnClaimIntentOnChain({ operator, intent: intentPda });
        await updatePaymentIntentStatus({
          id: item.intent.id,
          status: "claimed",
          assignedCrankerPubkey: operator.publicKey.toBase58(),
          leaseExpiryAt: new Date(Date.now() + 30_000).toISOString(),
          claimTxSig: claimTx.signature ?? null,
        });

        const payoutSig64 = randomBytes(64);
        const proofTx = await tsnSubmitProofOnChain({
          operator,
          intent: intentPda,
          payoutTxSig64: payoutSig64,
          payoutAmountBaseUnits,
          tokenMint,
          recipientWallet,
        });

        await updatePaymentIntentStatus({
          id: item.intent.id,
          status: "executed",
          proofTxSig: proofTx.signature ?? claimTx.signature ?? null,
        });
        await updateClaimRequestStatus({ id: item.claimRequestId, status: "completed" });

        await markPaymentClaimed({
          id: item.intent.payment_id,
          releaseSignature: null,
          releasedToWallet: item.destinationWallet,
          claimFeeAmount: claimFeeAmountUi,
        });

        const encryptedPayload = encryptPayload(aesKey, {
          recipient_wallet: item.destinationWallet,
          recipient_phone_hash: item.intent.recipient_hash,
          amount_raw: item.intent.amount,
          payout_amount: payoutAmountUi,
          claim_fee_amount: claimFeeAmountUi,
          estimated_network_fee_lamports: estimatedNetworkFeeLamports,
          token_mint: item.intent.token_mint_address,
        });

        const entry = {
          intent_id: item.intent.id,
          timestamp: new Date().toISOString(),
          cranker_pubkey: operator.publicKey.toBase58(),
          proof_tx: proofTx.signature,
          encrypted_payload: encryptedPayload,
        };

        appendFileSync(ledgerPath, `${JSON.stringify(entry)}\n`, "utf8");
        console.log(`[tsn-cranker] executed intent=${item.intent.id} proof=${proofTx.signature}`);
      } catch (error) {
        await updateClaimRequestStatus({ id: item.claimRequestId, status: "failed" }).catch(() => undefined);
        console.error(`[tsn-cranker] failed intent=${item.intent.id}`, error);
      }
    }

    await sleep(2000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
