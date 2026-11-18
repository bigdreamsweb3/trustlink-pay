import type { TransactionPort, DocumentPort } from "../../storage/ports";
import type { Dependencies } from "./dependencies";
import { timingSafeEqual } from "node:crypto";
import { CRANKER_SESSION_IDLE_TTL_MS } from "./configuration";

/** consumeCrankerSessionRequest component. Inputs and results retain the original cranker-auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function consumeCrankerSessionRequest(dependencies: Pick<Dependencies, "clock">, context: { reference: DocumentPort; publicKey: string; tokenHash: NonSharedBuffer; now: number; counterValue: number; nowIso: string }, transaction: TransactionPort) {
const { reference, publicKey, tokenHash, now, counterValue, nowIso } = context;

    const snapshot = await transaction.get(reference);
    if (!snapshot.exists || snapshot.get("publicKey") !== publicKey) return "CRANKER_SESSION_INVALID";
    const storedHash = String(snapshot.get("tokenHash") ?? "");
    if (!/^[0-9a-f]{64}$/i.test(storedHash) || !timingSafeEqual(Buffer.from(storedHash, "hex"), tokenHash)) return "CRANKER_SESSION_INVALID";
    const expiresAt = dependencies.clock.parse(String(snapshot.get("expiresAt") ?? ""));
    const lastSeenAt = dependencies.clock.parse(String(snapshot.get("lastSeenAt") ?? ""));
    if (!Number.isFinite(expiresAt) || expiresAt <= now || !Number.isFinite(lastSeenAt) || now - lastSeenAt > CRANKER_SESSION_IDLE_TTL_MS) return "CRANKER_SESSION_EXPIRED";
    const lastCounter = Number(snapshot.get("lastCounter") ?? 0);
    if (!Number.isSafeInteger(lastCounter) || lastCounter < 0 || counterValue <= lastCounter) return "CRANKER_REQUEST_REPLAYED";
    transaction.update(reference, { lastCounter: counterValue, lastSeenAt: nowIso });
    return "OK";
  
}
