import type { Dependencies } from "./dependencies";
import { staleDocumentEntry } from "./stale-document-entry";
import { deleteDocumentReference } from "./delete-document-reference";
import { CRANKER_SESSION_IDLE_TTL_MS } from "./configuration";

/** pruneCrankerSessions component. Inputs and results retain the original cranker-auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function pruneCrankerSessions(dependencies: Pick<Dependencies, "clock" | "sessionCollection">) {
  const now = dependencies.clock.now();
  const [expired, idle] = await Promise.all([
    dependencies.sessionCollection.where("expiresAt", "<=", new dependencies.clock(now).toISOString()).limit(100).get(),
    dependencies.sessionCollection.where("lastSeenAt", "<=", new dependencies.clock(now - CRANKER_SESSION_IDLE_TTL_MS).toISOString()).limit(100).get(),
  ]);
  const stale = new Map([...expired.docs, ...idle.docs].map(staleDocumentEntry));
  await Promise.all([...stale.values()].map(deleteDocumentReference));
}
