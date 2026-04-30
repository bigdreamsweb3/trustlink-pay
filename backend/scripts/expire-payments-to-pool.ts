import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { expirePendingPayments } = await import("../app/services/payments");

  const result = await expirePendingPayments(0);
  console.log(`Expiry sweep disabled. Reviewed: ${result.processed}`);
}

main().catch((error) => {
  console.error("Expire payment review failed.");
  console.error(error);
  process.exit(1);
});
