import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { expirePendingPayments } = await import("../app/services/payments");

  const limitArg = process.argv[2];
  const limit = limitArg ? Number(limitArg) : 100;

  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error("Limit must be a positive number");
  }

  const result = await expirePendingPayments(limit);

  console.log(`Expired payments processed: ${result.processed}`);
  for (const payment of result.payments) {
    console.log(
      `${payment.paymentId} -> ${payment.recoveryWalletAddress} (${payment.signature ?? "mock-signature"})`,
    );
  }
}

main().catch((error) => {
  console.error("Expire payments to pool failed.");
  console.error(error);
  process.exit(1);
});
