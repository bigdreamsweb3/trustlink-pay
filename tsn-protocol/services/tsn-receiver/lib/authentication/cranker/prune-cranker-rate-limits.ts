import type { Dependencies } from "./dependencies";
import { deleteStaleRateDocument } from "./delete-stale-rate-document";

/** Remove the bounded stale-rate page in one commit; query and commit failures propagate. */
export async function pruneCrankerRateLimits(dependencies: Pick<Dependencies, "rateCollection" | "database">, updatedBefore: string) {
  const stale = await dependencies.rateCollection.where("updatedAt", "<=", updatedBefore).limit(100).get();
  if (!stale.docs.length) return;
  const batch = dependencies.database.batch();
  stale.docs.forEach(deleteStaleRateDocument.bind(null, batch));
  await batch.commit();
}
