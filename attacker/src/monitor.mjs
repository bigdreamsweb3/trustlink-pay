import { readFileSync } from "node:fs";

const configPath = process.argv[2] ?? "config/ecosystem.local.json";
const config = JSON.parse(readFileSync(configPath, "utf8"));
if (config.network !== "localnet") throw new Error("monitor_requires_localnet");
if (!config.rpcUrl.startsWith("http://127.0.0.1:") && !config.rpcUrl.startsWith("http://localhost:")) {
  throw new Error("rpc_must_be_loopback");
}
if (config.cloudAi?.sendRawTransactions !== false || config.cloudAi?.executeGeneratedCode !== false) {
  throw new Error("unsafe_cloud_ai_permissions");
}
for (const [name, id] of Object.entries(config.programs ?? {})) {
  if (typeof id !== "string" || id.startsWith("REPLACE_")) {
    throw new Error(`missing_local_program_id:${name}`);
  }
}
console.log(JSON.stringify({
  ready: true,
  mode: "localnet-read-only-monitor",
  programs: Object.keys(config.programs),
  services: Object.keys(config.services ?? {}),
  cloudAi: "advisory-only",
}));
