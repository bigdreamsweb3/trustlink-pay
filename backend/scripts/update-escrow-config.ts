import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { getEscrowConfigState, getEscrowVerifierPublicKey, updateEscrowConfig } = await import("../app/blockchain/solana");
  const { getEscrowFeeConfig } = await import("../app/config/escrow");

  const verifier = getEscrowVerifierPublicKey();
  const feeConfig = getEscrowFeeConfig();
  const before = await getEscrowConfigState();

  console.log(`Escrow verifier pubkey: ${verifier}`);
  console.log(`Treasury owner target: ${feeConfig.treasuryOwner}`);
  console.log(`Fee bps target: ${feeConfig.feeBps}`);
  console.log(`Fee cap UI amount target: ${feeConfig.feeCapUiAmount}`);

  if (before) {
    console.log(`Current config address: ${before.address}`);
    console.log(`Current claim verifier: ${before.claimVerifier}`);
    console.log(`Current treasury owner: ${before.treasuryOwner}`);
    console.log(`Current fee bps: ${before.feeBps}`);
    console.log(`Current fee cap: ${before.feeCap}`);
  } else {
    console.log("Escrow config is not initialized yet.");
  }

  const configAddress = await updateEscrowConfig();
  const after = await getEscrowConfigState();

  console.log(`Escrow config updated at: ${configAddress}`);

  if (after) {
    console.log(`Updated claim verifier: ${after.claimVerifier}`);
    console.log(`Updated treasury owner: ${after.treasuryOwner}`);
    console.log(`Updated fee bps: ${after.feeBps}`);
    console.log(`Updated fee cap: ${after.feeCap}`);
  }
}

main().catch((error) => {
  console.error("Escrow config update failed.");
  console.error(error);
  process.exit(1);
});
