import type { Batch } from "./batch";
import type { Ref } from "./ref";
import type { Row } from "./types";
export function batchSet(this: Batch, reference: Ref, value: Row, options?: { merge?: boolean }) { this.writes.push({ operation:"set", reference,value,merge:options?.merge }); return this; }
