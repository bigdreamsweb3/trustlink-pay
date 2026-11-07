// Read-only current SDK history verification. Prints allowlisted public metadata only.
import { createRequire } from "node:module";
import { loadGpruFinalizedCreditHistoryV1 } from "../tsn-protocol/sdks/tsn-sdk/dist/gpru/chain-history.js";
const require = createRequire(new URL("../tsn-protocol/sdks/tsn-sdk/package.json", import.meta.url));
const { Connection } = require("@solana/web3.js");
try {
  const result = await loadGpruFinalizedCreditHistoryV1({ connection: new Connection(
    (process.env.TSN_RPC_URL || process.env.TSN_RPC_GATEWAY_URL || "http://127.0.0.1:8787").trim().replace(/^["']|["']$/g, ""),
  ) });
  console.log(JSON.stringify({ latestGlobalSequence: result.snapshot.sequence.toString(),
    credits: result.credits.map(credit => ({ signature: credit.signature, slot: credit.slot,
      tokenId: credit.action.tokenId, amountBaseUnits: credit.action.amountBaseUnits })) }, null, 2));
} catch (error) {
  console.error(error instanceof Error && error.message.startsWith("GPRU_") ? error.message :
    `Read-only SDK history verification failed (${error?.name ?? "unknown"}; ${error?.cause?.code ?? error?.code ?? "no RPC error code"}).`);
  process.exitCode = 1;
}
