import { config } from "dotenv";

config({ path: ".env.local" });

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { AutoclaimEngine } = await import("../app/services/payments/autoclaim-engine");

  const args = new Set(process.argv.slice(2));
  const once = args.has("--once");
  const tick = args.has("--tick");

  if (tick) {
    await AutoclaimEngine.triggerTick();
  }

  do {
    const result = await AutoclaimEngine.processNextJob();
    if (!result.processed) {
      if (once) {
        break;
      }
      await sleep(2_000);
    }
  } while (!once);
}

main().catch((error) => {
  console.error("Autoclaim worker failed.");
  console.error(error);
  process.exit(1);
});

