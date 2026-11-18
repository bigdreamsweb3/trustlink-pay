/** Read a selected document through the transaction's full-store snapshot. */
export async function readTransactionDocument(reference, transaction) {
  return transaction.get(reference);
}
