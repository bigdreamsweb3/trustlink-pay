import {
  HttpTsnMempool,
  JsonFileTsnMempool,
  evaluateSettlementEconomics,
} from "@trustlink/tsn-cranker-sdk";
import {
  getTsnIntentPda,
  getTsnMotherEscrowPda,
  tsnClaimIntentOnChain,
  tsnCreateIntentOnChain,
  tsnFetchIntentOnChain,
  tsnSubmitProofOnChain,
} from "../../tsn-sdk/dist/blockchain/solana-tsn.js";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import "dotenv/config";

type TsnWorkItem = Awaited<ReturnType<ReturnType<typeof createMempoolClient>["listPendingWork"]>>[number];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMempoolClient() {
  if (process.env.TSN_MEMPOOL_URL) {
    return new HttpTsnMempool(process.env.TSN_MEMPOOL_URL);
  }

  return new JsonFileTsnMempool();
}

function loadOperatorKeypair() {
  const rawSecret = process.env.TSN_CRANKER_OPERATOR_SECRET_KEY?.trim();
  if (rawSecret) {
    const parsed = JSON.parse(rawSecret) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  }

  const keypairPath = process.env.TSN_CRANKER_KEYPAIR_PATH ?? process.env.KEYPAIR_PATH;
  if (!keypairPath) {
    throw new Error("Set TSN_CRANKER_KEYPAIR_PATH or TSN_CRANKER_OPERATOR_SECRET_KEY for real cranker execution");
  }

  const parsed = JSON.parse(readFileSync(keypairPath, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
}

function hex32(value: string, label: string) {
  const buffer = Buffer.from(value, "hex");
  if (buffer.length !== 32) throw new Error(`${label} must be a 32-byte hex string`);
  return buffer;
}

function toBaseUnits(amountUi: number | string, decimals: number) {
  const raw = String(amountUi);
  const [whole, fraction = ""] = raw.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(paddedFraction || "0");
}

function getRecipientAmountUi(item: TsnWorkItem) {
  const maybeRecipientAmount = Number((item.intent as TsnWorkItem["intent"] & { recipientAmount?: number }).recipientAmount);
  if (Number.isFinite(maybeRecipientAmount) && maybeRecipientAmount > 0 && maybeRecipientAmount <= Number(item.intent.amount)) {
    return maybeRecipientAmount;
  }

  return Number(item.intent.amount);
}

async function executeRealTsnWork(params: {
  item: TsnWorkItem;
  mempool: ReturnType<typeof createMempoolClient>;
  operator: Keypair;
  rpcUrl: string;
  tokenDecimals: number;
}) {
  const intentSeed32 = hex32(params.item.intent.intentSeedHash, "intentSeedHash");
  const recipientHash32 = hex32(params.item.intent.recipientHash, "recipientHash");
  const tokenMint = new PublicKey(params.item.intent.tokenMintAddress);
  const recipientWallet = new PublicKey(params.item.claimRequest.destinationWallet);
  const underlyingPayment = new PublicKey(params.item.intent.underlyingPayment ?? "");
  const motherEscrow = getTsnMotherEscrowPda();
  const intent = getTsnIntentPda({ motherEscrow, intentSeed32 });
  const intentAmountBaseUnits = toBaseUnits(params.item.intent.amount, params.tokenDecimals);
  const payoutAmountBaseUnits = toBaseUnits(getRecipientAmountUi(params.item), params.tokenDecimals);

  let onchainIntent = await tsnFetchIntentOnChain({ intent, rpcUrl: params.rpcUrl });
  if (!onchainIntent) {
    await tsnCreateIntentOnChain({
      payer: params.operator,
      intentSeed32,
      underlyingPayment,
      tokenMint,
      amountBaseUnits: intentAmountBaseUnits,
      recipientHash32,
      rpcUrl: params.rpcUrl,
    });
    onchainIntent = await tsnFetchIntentOnChain({ intent, rpcUrl: params.rpcUrl });
  }
  if (!onchainIntent) throw new Error(`Intent ${intent.toBase58()} was not created on chain`);
  if (onchainIntent.status === 2) {
    return {
      intent: intent.toBase58(),
      proofSignature: onchainIntent.payoutTxSigBase58 ?? "already-executed-onchain",
    };
  }
  if (onchainIntent.status !== 0 && onchainIntent.status !== 1) {
    throw new Error(`Intent ${intent.toBase58()} is not executable; on-chain status=${onchainIntent.status}`);
  }

  if (onchainIntent.status === 0) {
    const claimed = await tsnClaimIntentOnChain({
      operator: params.operator,
      intent,
      rpcUrl: params.rpcUrl,
    });
    await params.mempool.updateIntentStatus(params.item.intent.id, "claimed", {
      source: params.item.intent.source,
      assignedCrankerPubkey: params.operator.publicKey.toBase58(),
      claimTxSig: claimed.signature,
      settlementReason: "Cranker claimed the TSN intent on chain.",
    } as Partial<TsnWorkItem["intent"]>);
  }

  const proofSeed = Buffer.concat([
    intent.toBuffer(),
    params.operator.publicKey.toBuffer(),
    Buffer.from(Date.now().toString()),
  ]);
  const payoutTxSig64 = createHash("sha512").update(proofSeed).digest();
  const proof = await tsnSubmitProofOnChain({
    operator: params.operator,
    intent,
    tokenMint,
    recipientWallet,
    payoutTxSig64,
    payoutAmountBaseUnits,
    rpcUrl: params.rpcUrl,
    treasuryOwner: process.env.TSN_TREASURY_OWNER ?? null,
  });

  return {
    intent: intent.toBase58(),
    proofSignature: proof.signature,
  };
}

async function postHeartbeat(operator: string) {
  if (!process.env.TSN_MEMPOOL_URL) return;

  try {
    const response = await fetch(`${process.env.TSN_MEMPOOL_URL.replace(/\/$/, "")}/crankers/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operator_pubkey: operator,
        cranker_pubkey: process.env.TSN_CRANKER_PDA ?? null,
        version: "reference-cranker",
        source: "tsn-cranker-op-daemon",
      }),
    });

    if (!response.ok) {
      console.warn(`[tsn-cranker] heartbeat failed status=${response.status}`);
    }
  } catch (error) {
    console.warn("[tsn-cranker] heartbeat failed", error);
  }
}

async function main() {
  const mempool = createMempoolClient();
  const operatorKeypair = loadOperatorKeypair();
  const operator = operatorKeypair.publicKey.toBase58();
  if (process.env.TSN_CRANKER_OPERATOR_PUBKEY && process.env.TSN_CRANKER_OPERATOR_PUBKEY !== operator) {
    console.warn(
      `[tsn-cranker] ignoring TSN_CRANKER_OPERATOR_PUBKEY=${process.env.TSN_CRANKER_OPERATOR_PUBKEY}; using signer keypair ${operator}`,
    );
  }
  const rpcUrl = process.env.RPC_URL ?? process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const tokenDecimals = Number(process.env.TSN_CRANKER_TOKEN_DECIMALS ?? 6);

  console.log(`[tsn-cranker] operator=${operator}`);
  console.log("[tsn-cranker] source=tsn-mempool");
  console.log("[tsn-cranker] execution=real-onchain");

  while (true) {
    await postHeartbeat(operator);

    const work = await mempool.listPendingWork(20);
    for (const item of work) {
      try {
        await mempool.updateClaimRequestStatus(
          item.claimRequest.id,
          "processing",
        );

        const economics = evaluateSettlementEconomics({
          paymentAmountUi: item.intent.amount,
          tokenUsd: Number(process.env.TSN_CRANKER_TOKEN_USD ?? 1),
          estimatedExecutionCostLamports: Number(
            process.env.TSN_CRANKER_EXECUTION_LAMPORTS ?? 20_000,
          ),
          ataCreationCostLamports: Number(
            process.env.TSN_CRANKER_ATA_LAMPORTS ?? 2_039_280,
          ),
          solUsd: Number(process.env.TSN_CRANKER_SOL_USD ?? 150),
          operatorFeeUi: Number(
            process.env.TSN_CRANKER_OPERATOR_FEE_UI ?? 0.02,
          ),
          safetyMultiplier: Number(
            process.env.TSN_CRANKER_SAFETY_MULTIPLIER ?? 1.25,
          ),
        });

        if (economics.likelihood === "economically_non_claimable") {
          await mempool.updateIntentStatus(item.intent.id, "reverted", {
            source: item.intent.source,
            settlementResolution: "reverted",
            settlementReason: economics.reason,
          });
          await mempool.updateClaimRequestStatus(
            item.claimRequest.id,
            "completed",
            {
              settlementReason: economics.reason,
            },
          );
          console.log(
            `[tsn-cranker] reverted intent=${item.intent.id} claim=${item.claimRequest.id} reason="${economics.reason}"`,
          );
          continue;
        }

        const execution = await executeRealTsnWork({
          item,
          mempool,
          operator: operatorKeypair,
          rpcUrl,
          tokenDecimals,
        });

        const proofTxSig = execution.proofSignature;
        await mempool.postProof({
          intent_id: item.intent.id,
          timestamp: new Date().toISOString(),
          cranker_pubkey: operator,
          proof_tx: proofTxSig,
          encrypted_payload: null,
        });

        await mempool.updateIntentStatus(item.intent.id, "executed", {
          source: item.intent.source,
          settlementResolution: "completed",
          settlementReason: economics.reason,
        });
        await mempool.updateClaimRequestStatus(
          item.claimRequest.id,
          "completed",
          {
            settlementReason: economics.reason,
          },
        );

        console.log(
          `[tsn-cranker] executed intent=${item.intent.id} onchain=${execution.intent} claim=${item.claimRequest.id} proof=${proofTxSig}`,
        );
      } catch (error) {
        await mempool
          .updateClaimRequestStatus(item.claimRequest.id, "failed")
          .catch(() => undefined);
        console.error(`[tsn-cranker] failed intent=${item.intent.id}`, error);
      }
    }

    await sleep(Number(process.env.TSN_CRANKER_POLL_MS ?? 2000));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
