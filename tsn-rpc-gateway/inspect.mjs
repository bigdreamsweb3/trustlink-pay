import { getRpcGatewayConfig, redactRpcUrlForDisplay } from "./config.mjs";
import { createProviderPool } from "./provider-pool.mjs";

const config = getRpcGatewayConfig();
const pool = createProviderPool(config.upstreams, config);
const selection = pool.getRankedProviders("getLatestBlockhash");

console.log("TrustLink RPC gateway");
console.log(`Mode: ${config.mode}`);
console.log(`Port: ${config.port}`);
console.log(`Timeout: ${config.timeoutMs}ms`);
console.log("Upstreams:");
for (const upstream of config.upstreams) {
  console.log(`- ${upstream.id} (${upstream.label}) -> ${redactRpcUrlForDisplay(upstream.url)}`);
}

console.log("Selection preview:");
for (const upstream of selection.slice(0, 3)) {
  console.log(`- ${upstream.id} (${upstream.label})`);
}
