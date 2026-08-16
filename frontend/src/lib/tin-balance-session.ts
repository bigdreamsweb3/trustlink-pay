"use client";

const STORAGE_KEY = "trustlink.tinBalanceAuthorization.v1";
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const SESSION_CLEARED_EVENT = "trustlink:tin-balance-session-cleared";

type StoredSession = {
  sessionBinding: string;
  lastActivityAt: number;
  hiddenAt: number | null;
  signatures: Record<string, string>;
};

function readSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof parsed.sessionBinding !== "string" ||
      typeof parsed.lastActivityAt !== "number" ||
      !Number.isFinite(parsed.lastActivityAt) ||
      !parsed.signatures ||
      typeof parsed.signatures !== "object"
    ) {
      return null;
    }
    if (Date.now() - parsed.lastActivityAt >= IDLE_TIMEOUT_MS) {
      clearTinBalanceAuthorizationSession();
      return null;
    }
    return {
      sessionBinding: parsed.sessionBinding,
      lastActivityAt: parsed.lastActivityAt,
      hiddenAt: typeof parsed.hiddenAt === "number" ? parsed.hiddenAt : null,
      signatures: parsed.signatures as Record<string, string>,
    };
  } catch {
    return null;
  }
}

function writeSession(value: StoredSession) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function getOrCreateSession() {
  const existing = readSession();
  if (existing) return existing;
  const created: StoredSession = {
    sessionBinding: crypto.randomUUID(),
    lastActivityAt: Date.now(),
    hiddenAt: null,
    signatures: {},
  };
  writeSession(created);
  return created;
}

export function getTinBalanceSessionBinding() {
  const session = getOrCreateSession();
  session.lastActivityAt = Date.now();
  session.hiddenAt = null;
  writeSession(session);
  return `tsn-authorized-device:${session.sessionBinding}`;
}

export function getCachedTinBalanceAuthorization(key: string) {
  return readSession()?.signatures[key] ?? null;
}

export function cacheTinBalanceAuthorization(key: string, signatureBase64: string) {
  const session = getOrCreateSession();
  session.signatures[key] = signatureBase64;
  session.lastActivityAt = Date.now();
  session.hiddenAt = null;
  writeSession(session);
}

export function touchTinBalanceAuthorizationSession() {
  const session = readSession();
  if (!session) return;
  session.lastActivityAt = Date.now();
  session.hiddenAt = null;
  writeSession(session);
}

export function markTinBalanceSessionHidden() {
  const session = readSession();
  if (!session) return;
  session.hiddenAt ??= Date.now();
  writeSession(session);
}

export function checkTinBalanceSessionVisibility() {
  const session = readSession();
  if (!session) return false;
  if (session.hiddenAt != null && Date.now() - session.hiddenAt >= IDLE_TIMEOUT_MS) {
    clearTinBalanceAuthorizationSession();
    return false;
  }
  session.hiddenAt = null;
  writeSession(session);
  return true;
}

export function clearTinBalanceAuthorizationSession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(SESSION_CLEARED_EVENT));
}

export const TIN_BALANCE_SESSION_CLEARED_EVENT = SESSION_CLEARED_EVENT;

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", touchTinBalanceAuthorizationSession, { passive: true });
  window.addEventListener("keydown", touchTinBalanceAuthorizationSession);
  window.addEventListener("touchstart", touchTinBalanceAuthorizationSession, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") markTinBalanceSessionHidden();
    else checkTinBalanceSessionVisibility();
  });
}
