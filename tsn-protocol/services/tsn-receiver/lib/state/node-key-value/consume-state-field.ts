import type { TransactionPort, DocumentPort } from "../../storage/ports";


/** consumeStateField component. Inputs and results retain the original node-state-store contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function consumeStateField(context: { reference: DocumentPort; field: string | null; body: Record<string, unknown> }, transaction: TransactionPort) {
const { reference, field, body } = context;

      const snapshot = await transaction.get(reference);
      if (snapshot.exists) return false;
      transaction.create(reference, { field, value: String(body.value ?? "") });
      return true;
    
}
