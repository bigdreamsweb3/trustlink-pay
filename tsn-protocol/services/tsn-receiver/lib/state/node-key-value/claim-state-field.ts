import type { TransactionPort, DocumentPort } from "../../storage/ports";

/** Atomically claim a canonical nonce binding and allow exact same-work recovery. */
export async function claimStateField(context: { reference: DocumentPort; field: string; value: string }, transaction: TransactionPort) {
  const snapshot = await transaction.get(context.reference);
  if (snapshot.exists) return snapshot.get("value") === context.value;
  transaction.create(context.reference, { field: context.field, value: context.value });
  return true;
}
