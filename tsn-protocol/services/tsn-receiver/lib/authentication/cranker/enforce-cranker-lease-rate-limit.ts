import type { Dependencies } from "./dependencies";
import { createHash } from "node:crypto";
import { pruneCrankerRateLimits } from "./prune-cranker-rate-limits";
import { incrementCrankerLeaseBucket } from "./increment-cranker-lease-bucket";

/** enforceCrankerLeaseRateLimit component. Inputs and results retain the original cranker-auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function enforceCrankerLeaseRateLimit(dependencies: Pick<Dependencies, "clock" | "rateCollection" | "database">, publicKey: string) {
  const now = dependencies.clock.now();
  await pruneCrankerRateLimits(dependencies, new dependencies.clock(now - 60_000).toISOString());
  const bucket = `${publicKey}|${Math.floor(dependencies.clock.now() / 60_000)}`;
  const reference = dependencies.rateCollection.doc(createHash("sha256").update(bucket).digest("hex"));
  const allowed = await dependencies.database.runTransaction(incrementCrankerLeaseBucket.bind(null, dependencies, { reference, publicKey, bucket }));
  if (!allowed) throw new Error("CRANKER_LEASE_RATE_LIMITED");
}
