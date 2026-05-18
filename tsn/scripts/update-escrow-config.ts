import { config } from "dotenv";

config({ path: "../backend/.env.local" });
config({ path: ".env.local", override: true });

async function main() {
  const { getEscrowConfigState, getEscrowVerifierPublicKey, updateEscrowConfig } = await import(
    "../../backend/app/blockchain/solana"
  );
  const { getEscrowPolicyConfig } = await import("../../backend/app/config/escrow");

  const verifier = getEscrowVerifierPublicKey();
  const policy = getEscrowPolicyConfig();
  const before = await getEscrowConfigState();

  console.log(`Escrow verifier pubkey: ${verifier}`);
  console.log(`Treasury owner target: ${policy.treasuryOwner}`);
  console.log(`Send fee target: ${policy.sendFeeBps} bps, max UI ${policy.sendFeeMaxUiAmount}, max margin USD ${policy.sendFeeMaxUsd}`);
  console.log(`Claim fee target: ${policy.claimFeeBps} bps, max UI ${policy.claimFeeMaxUiAmount}, max margin USD ${policy.claimFeeMaxUsd}`);
  console.log(`Fee coverage tx count target: ${policy.feeCoverageTxCount}`);
  console.log(`Default expiry seconds target: ${policy.defaultExpirySeconds}`);

  if (before) {
    console.log(`Current config layout: ${before.layout}`);
    console.log(`Current config address: ${before.address}`);
    console.log(`Current claim verifier: ${before.claimVerifier}`);
    console.log(`Current treasury owner: ${before.treasuryOwner ?? "(legacy unset)"}`);
    console.log(`Current send fee: ${before.sendFeeBps} bps, max ${before.sendFeeMaxUiAmount}`);
    console.log(`Current claim fee: ${before.claimFeeBps} bps, max ${before.claimFeeMaxUiAmount}`);
    console.log(`Current send fee max margin USD: ${before.sendFeeMaxUsd}`);
    console.log(`Current claim fee max margin USD: ${before.claimFeeMaxUsd}`);
    console.log(`Current fee coverage tx count: ${before.feeCoverageTxCount}`);
    console.log(`Current default expiry seconds: ${before.defaultExpirySeconds}`);
  } else {
    console.log("Escrow config is not initialized yet.");
  }

  const configAddress = await updateEscrowConfig();
  const after = await getEscrowConfigState();

  console.log(`Escrow config updated at: ${configAddress}`);

  if (after) {
    console.log(`Updated config layout: ${after.layout}`);
    console.log(`Updated claim verifier: ${after.claimVerifier}`);
    console.log(`Updated treasury owner: ${after.treasuryOwner ?? "(unset)"}`);
    console.log(`Updated send fee: ${after.sendFeeBps} bps, max ${after.sendFeeMaxUiAmount}`);
    console.log(`Updated claim fee: ${after.claimFeeBps} bps, max ${after.claimFeeMaxUiAmount}`);
    console.log(`Updated send fee max margin USD: ${after.sendFeeMaxUsd}`);
    console.log(`Updated claim fee max margin USD: ${after.claimFeeMaxUsd}`);
    console.log(`Updated fee coverage tx count: ${after.feeCoverageTxCount}`);
    console.log(`Updated default expiry seconds: ${after.defaultExpirySeconds}`);
  }
}

main().catch((error) => {
  console.error("Escrow config update failed.");
  console.error(error);
  process.exit(1);
});
