import type { WorkKind } from "../models";
import { INTERNAL_KEYS } from "../constants";
import { assertAllowlisted } from "./assert-allowlisted";
import { isSupportedWorkKind } from "../kinds/is-supported-work-kind";

/**
 * Validate the work kind and its current durable payload allowlist.
 * Input: the explicit typed parameters below. Output: No return value on accepted records.
 * Dependencies: named imports; no service/database initialization.
 * Errors: WORK_KIND_UNSUPPORTED or the existing contextual unsupported-field error.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function assertDurablePayload(kind: WorkKind, payload: Record<string, unknown>): void {
  if (!isSupportedWorkKind(kind)) throw new Error("WORK_KIND_UNSUPPORTED");
  assertAllowlisted(payload, INTERNAL_KEYS[kind], kind);
}
