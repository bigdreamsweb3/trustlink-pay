import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { getEscrowConfigState, getEscrowVerifierPublicKey, updateEscrowConfig } = await import("../app/blockchain/solana");
  const { getEscrowPolicyConfig } = await import("../app/config/escrow");

  const verifier = getEscrowVerifierPublicKey();
  const policy = getEscrowPolicyConfig();
  const before = await getEscrowConfigState();

  console.log(`Escrow verifier pubkey: ${verifier}`);
  console.log(`Treasury owner target: ${policy.treasuryOwner}`);
  console.log(`Default expiry seconds target: ${policy.defaultExpirySeconds}`);

  if (before) {
    console.log(`Current config address: ${before.address}`);
    console.log(`Current claim verifier: ${before.claimVerifier}`);
    console.log(`Current treasury owner: ${before.treasuryOwner}`);
    console.log(`Current default expiry seconds: ${before.defaultExpirySeconds}`);
  } else {
    console.log("Escrow config is not initialized yet.");
  }

  const configAddress = await updateEscrowConfig();
  const after = await getEscrowConfigState();

  console.log(`Escrow config updated at: ${configAddress}`);

  if (after) {
    console.log(`Updated claim verifier: ${after.claimVerifier}`);
    console.log(`Updated treasury owner: ${after.treasuryOwner}`);
    console.log(`Updated default expiry seconds: ${after.defaultExpirySeconds}`);
  }
}

main().catch((error) => {
  console.error("Escrow config update failed.");
  console.error(error);
  process.exit(1);
});
