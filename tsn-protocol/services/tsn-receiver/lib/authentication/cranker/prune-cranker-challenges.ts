import type { Dependencies } from "./dependencies";
import { staleDocumentEntry } from "./stale-document-entry";
import { deleteDocumentReference } from "./delete-document-reference";

/** pruneCrankerChallenges component. Inputs and results retain the original cranker-auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function pruneCrankerChallenges(dependencies: Pick<Dependencies, "clock" | "challengeCollection">) {
  const expiredAt = new dependencies.clock().toISOString();
  const [used, expired] = await Promise.all([
    dependencies.challengeCollection.where("used", "==", true).limit(100).get(),
    dependencies.challengeCollection.where("expiresAt", "<=", expiredAt).limit(100).get(),
  ]);
  const stale = new Map([...used.docs, ...expired.docs].map(staleDocumentEntry));
  await Promise.all([...stale.values()].map(deleteDocumentReference));
}
