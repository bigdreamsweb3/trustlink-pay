import type { WorkKind } from "../models";

/**
 * Accept an unknown value and identify one of the four existing durable work kinds.
 * Input: the explicit typed parameters below. Output: Boolean work-kind guard.
 * Dependencies: named imports; no service/database initialization.
 * Errors: No deliberate domain error; no dependency calls.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function isSupportedWorkKind(kind: unknown): kind is WorkKind {
  return typeof kind === "string" && ["AUTHORIZED_FUNDING", "SETTLEMENT", "TIN_DEBIT", "TIN_OPERATION", "TCAP_EPOCH_ACCOUNTING"].includes(kind);
}
