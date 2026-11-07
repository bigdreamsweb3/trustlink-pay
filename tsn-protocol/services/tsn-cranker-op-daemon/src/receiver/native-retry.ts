/** Exact pre-signing conflicts accepted by Receiver's native re-verification route. */
const NATIVE_REVERIFY_REASONS = new Set([
  "TCAP_FUNDING_ROOT_CHANGED_BEFORE_SETTLEMENT",
  "TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT",
  "TCAP_POOL_CAPTURE_STALE",
  "TCAP_CREDIT_EPOCH_CHANGED_BEFORE_SETTLEMENT",
  "TCAP_EPOCH_ALREADY_ACCOUNTED",
  "TIP route root changed since settlement verification",
  "TCAP credit authorization expired",
]);

export function nativeConflictReason(status: number, rejection: unknown): string | null {
  if (status !== 409 || !rejection || typeof rejection !== "object" || Array.isArray(rejection)) return null;
  const body = rejection as Record<string, unknown>;
  // FastAPI uses detail; Receiver's own handlers use error. Never substring-match.
  const reason = body.detail ?? body.error;
  return typeof reason === "string" && NATIVE_REVERIFY_REASONS.has(reason) ? reason : null;
}

export function nativeWorkRetryReason(work: {
  kind: string; result?: Record<string, unknown> | null;
  verification?: { verificationType?: string | null } | null;
}, error: unknown): string | null {
  if (work.result?.signature || !(error instanceof Error) || !NATIVE_REVERIFY_REASONS.has(error.message)) return null;
  const native = work.kind === "TCAP_FUNDING_POOL" || work.kind === "TCAP_EPOCH_ACCOUNTING"
    || (work.kind === "SETTLEMENT" && work.verification?.verificationType === "TSN_TCAP_GPRU_HIDDEN_HEAD_V1");
  return native ? error.message : null;
}
