import { HttpTsnMempool, JsonFileTsnMempool, sha256Bytes } from "../tsn-sdk/src";

function createMempoolClient() {
  if (process.env.TSN_MEMPOOL_URL) {
    return new HttpTsnMempool(process.env.TSN_MEMPOOL_URL);
  }

  return new JsonFileTsnMempool();
}

async function main() {
  const command = process.argv[2];

  if (command === "status") {
    const mempool = createMempoolClient();
    const work = await mempool.listPendingWork(50);
    console.log({
      mempool: process.env.TSN_MEMPOOL_URL ?? process.env.TSN_MEMPOOL_FILE ?? ".tsn/mempool.json",
      pendingWork: work.length,
    });
    return;
  }

  if (command === "protocol-seed") {
    console.log({ protocolSeedHex: sha256Bytes(process.argv[3] ?? "tsn-dev-seed").toString("hex") });
    return;
  }

  if (command === "register-cranker") {
    console.log({
      cranker: process.env.TSN_CRANKER_OPERATOR_PUBKEY ?? "local-dev-cranker",
      status: "registered-locally",
      note: "On-chain cranker registration is owned by the TSN SDK adapter, not the TrustLink backend.",
    });
    return;
  }

  console.error(`Unknown command: ${command ?? "(missing)"}`);
  console.error(`Usage:
  npm run setup -- status
  npm run setup -- protocol-seed [SEED]
  npm run setup -- register-cranker`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
