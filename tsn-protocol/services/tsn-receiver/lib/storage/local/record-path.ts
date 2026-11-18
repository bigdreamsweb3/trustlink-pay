import { createHash } from "node:crypto";
import { recordEpoch } from "./record-epoch";
import { safeToken } from "./safe-token";
import type { Row, StorageContext } from "./types";
/** Pure record placement; collection/document keys never become filesystem paths. */
export function recordPath(context: StorageContext, collection: string, id: string, row: Row): string {
  const name = createHash("sha256").update(id).digest("hex") + ".json";
  if (collection !== context.workCollection) return `metadata/${createHash("sha256").update(collection).digest("hex")}/${name}`;
  const epoch = recordEpoch(row);
  const kind = typeof row.kind === "string" ? row.kind : "UNKNOWN";
  const type = kind.length <= 64 && /^[A-Z][A-Z0-9_]*$/.test(kind) && !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(kind) ? kind : safeToken(kind);
  return `epochs/${epoch === null ? "unassigned" : safeToken(epoch)}/${type}/${name}`;
}
