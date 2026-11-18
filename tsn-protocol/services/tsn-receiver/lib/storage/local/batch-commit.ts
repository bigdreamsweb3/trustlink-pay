import { mutateStore } from "./mutate-store";
import { applyBatch } from "./apply-batch";
import type { Batch } from "./batch";
export async function batchCommit(this: Batch) { await mutateStore(this.context, applyBatch.bind(null,this.writes)); this.writes = []; }
