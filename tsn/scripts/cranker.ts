import { JsonFileTsnMempool, TsnHttpClient, evaluateSettlementEconomics, type TsnWorkItem } from "../src";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMempoolClient() {
  if (process.env.TSN_MEMPOOL_URL) {
    const client = new TsnHttpClient({ baseUrl: process.env.TSN_MEMPOOL_URL });
    return {
      listPendingWork: async (limit: number) => {
        const response = await client.listPendingWork<{ intents: TsnWorkItem[] }>(limit);
        return response.intents;
      },
      updateClaimRequestStatus: async () => null,
      updateIntentStatus: async () => null,
    };
  }

  return new JsonFileTsnMempool();
}

async function main() {
  const mempool = createMempoolClient();
  const operator = process.env.TSN_CRANKER_OPERATOR_PUBKEY ?? "local-dev-cranker";

  console.log(`[tsn-cranker] operator=${operator}`);
  console.log("[tsn-cranker] source=tsn-mempool");

  while (true) {
    const work = await mempool.listPendingWork(20);
    for (const item of work) {
      try {
        await mempool.updateClaimRequestStatus(item.claimRequest.id, "processing");

        const economics = evaluateSettlementEconomics({
          paymentAmountUi: item.intent.amount,
          tokenUsd: Number(process.env.TSN_CRANKER_TOKEN_USD ?? 1),
          estimatedExecutionCostLamports: Number(process.env.TSN_CRANKER_EXECUTION_LAMPORTS ?? 20_000),
          ataCreationCostLamports: Number(process.env.TSN_CRANKER_ATA_LAMPORTS ?? 2_039_280),
          solUsd: Number(process.env.TSN_CRANKER_SOL_USD ?? 150),
          operatorFeeUi: Number(process.env.TSN_CRANKER_OPERATOR_FEE_UI ?? 0.02),
          safetyMultiplier: Number(process.env.TSN_CRANKER_SAFETY_MULTIPLIER ?? 1.25),
        });

        if (economics.likelihood === "economically_non_claimable") {
          await mempool.updateIntentStatus(item.intent.id, "reverted", {
            source: item.intent.source,
            settlementResolution: "reverted",
            settlementReason: economics.reason,
          });
          await mempool.updateClaimRequestStatus(item.claimRequest.id, "completed", {
            settlementReason: economics.reason,
          });
          console.log(
            `[tsn-cranker] reverted intent=${item.intent.id} claim=${item.claimRequest.id} reason="${economics.reason}"`,
          );
          continue;
        }

        // The network execution adapter belongs here. Today this runner proves the TSN
        // ownership boundary by consuming TSN mempool work instead of TrustLink DB rows.
        // The next implementation step wires this point to the TSN on-chain program.
        const proofTxSig = `local-proof-${Date.now()}`;

        await mempool.updateIntentStatus(item.intent.id, "executed", {
          source: item.intent.source,
          settlementResolution: "completed",
          settlementReason: economics.reason,
        });
        await mempool.updateClaimRequestStatus(item.claimRequest.id, "completed", {
          settlementReason: economics.reason,
        });

        console.log(
          `[tsn-cranker] executed intent=${item.intent.id} claim=${item.claimRequest.id} proof=${proofTxSig}`,
        );
      } catch (error) {
        await mempool.updateClaimRequestStatus(item.claimRequest.id, "failed").catch(() => undefined);
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
