import "dotenv/config";

// Minimal placeholder CLI to prove the package is runnable.
// Full cranker daemon (watch intents, execute, PoP submit) lands in the next iteration.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

async function main() {
  const rpcUrl = requireEnv("RPC_URL");
  const programId = requireEnv("PROGRAM_ID");
  // KEYPAIR_PATH is parsed by the full daemon later.
  console.log(`[cranker-sdk] rpc=${rpcUrl} programId=${programId}`);
  console.log("[cranker-sdk] scaffold only (no daemon loop yet)");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

