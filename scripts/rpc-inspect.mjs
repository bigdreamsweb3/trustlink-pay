import { describeRpcSelection, withRpcFallback } from "./lib/tsn-rpc.mjs";

const flags = new Set(process.argv.slice(2));
const frontendSafe = flags.has("--frontend");
const check = flags.has("--check");

const selection = describeRpcSelection({ frontendSafe });

console.log("TrustLink RPC selection");
console.log(`Mode: ${frontendSafe ? "frontend-safe" : "server"}`);
console.log(`Selected: ${selection.selected}`);
console.log("Order:");
for (const url of selection.urls) {
  console.log(`- ${url}`);
}

if (check) {
  try {
    const checkedUrl = await withRpcFallback(async (connection, url) => {
      await connection.getLatestBlockhash("confirmed");
      return url;
    }, { frontendSafe });
    console.log(`RPC check: ok (${checkedUrl})`);
  } catch (error) {
    console.error("RPC check failed:");
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  }
}
