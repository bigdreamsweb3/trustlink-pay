import { createHash } from "node:crypto";
import { stable } from "./stable";

/**
 * Hash the existing canonical representation of the supplied value.
 * Input: the explicit typed parameters below. Output: Lowercase SHA-256 hexadecimal commitment.
 * Dependencies: named imports; no service/database initialization.
 * Errors: Native canonical serialization/hash errors propagate.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function payloadCommitment(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}
