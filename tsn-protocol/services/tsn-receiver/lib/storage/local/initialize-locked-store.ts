import { compactVerificationPayload } from "../../work-contract";
import { loadSnapshot } from "./load-snapshot";
import { commitSnapshot } from "./commit-snapshot";
import type { StorageContext } from "./types";
/** Retain the existing one-time verification compaction without changing any work contract. */
export async function initializeLockedStore(context: StorageContext): Promise<void> {
  const loaded = await loadSnapshot(context);
  const collection = loaded.data[context.workCollection];
  if (!collection) return;
  let compacted = 0;
  for (const row of Object.values(collection)) {
    if (!row.verification?.verifiedPayload || !row.payload) continue;
    row.verification = compactVerificationPayload(row.payload, row.verification);
    compacted += 1;
  }
  if (!compacted) return;
  await commitSnapshot(context, loaded.data, loaded);
  console.info(`[receiver] compacted Node verification payloads for ${compacted} local work record(s)`);
}
