export async function captureRateBatchCommit(context, batch, commit) {
  context.commits += 1;
  context.stagedDeletes += batch.writes.length;
  if (context.failure) throw context.failure;
  await commit();
}
