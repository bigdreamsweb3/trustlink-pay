import type { Batch } from "./batch";
import type { Ref } from "./ref";
export function batchDelete(this: Batch, reference: Ref) { this.writes.push({ operation:"delete", reference }); return this; }
