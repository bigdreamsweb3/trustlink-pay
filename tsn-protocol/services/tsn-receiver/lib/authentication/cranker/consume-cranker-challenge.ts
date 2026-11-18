import type { TransactionPort, DocumentPort } from "../../storage/ports";
import type { Dependencies } from "./dependencies";

/** consumeCrankerChallenge component. Inputs and results retain the original cranker-auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function consumeCrankerChallenge(dependencies: Pick<Dependencies, "clock">, context: { reference: DocumentPort; publicKey: string }, transaction: TransactionPort) {
const { reference, publicKey } = context;

    const snapshot = await transaction.get(reference);
    if (!snapshot.exists || snapshot.get("used") === true || snapshot.get("publicKey") !== publicKey || dependencies.clock.parse(String(snapshot.get("expiresAt") ?? "")) <= dependencies.clock.now()) return false;
    transaction.update(reference, { used: true, usedAt: new dependencies.clock().toISOString() });
    return true;
  
}
