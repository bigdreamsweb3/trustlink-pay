import { captureRateBatchCommit } from "./capture-rate-batch-commit.mjs";

export function captureRateBatch(context) {
  context.batches += 1;
  const batch = context.localDb.batch();
  batch.commit = captureRateBatchCommit.bind(null, context, batch, batch.commit.bind(batch));
  return batch;
}
