import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { getEscrowVerifierPublicKey, initializeEscrowConfig, isEscrowConfigInitialized } = await import(
    "../app/blockchain/solana"
  );
  const { getEscrowPolicyConfig } = await import("../app/config/escrow");

  const initialized = await isEscrowConfigInitialized();
  const verifier = getEscrowVerifierPublicKey();
  const policy = getEscrowPolicyConfig();

  console.log(`Escrow verifier pubkey: ${verifier}`);
  console.log(`Default expiry seconds: ${policy.defaultExpirySeconds}`);

  if (initialized) {
    console.log("Escrow config is already initialized.");
    return;
  }

  const configAddress = await initializeEscrowConfig();
  console.log(`Escrow config initialized at: ${configAddress}`);
}

main().catch((error) => {
  console.error("Escrow config initialization failed.");
  console.error(error);
  process.exit(1);
});
