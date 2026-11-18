/** Settle every in-flight record before releasing the lock, then preserve original-order errors. */
export async function completeRecordBatch<T>(operations: Promise<T>[]): Promise<T[]> {
  const results = await Promise.allSettled(operations);
  const values: T[] = [];
  for (const result of results) {
    if (result.status === "rejected") throw result.reason;
    values.push(result.value);
  }
  return values;
}
