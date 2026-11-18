import { Batch } from "./batch";
import type { LocalDb } from "./local-db";
export function dbBatch(this: LocalDb) { return new Batch(this.context); }
