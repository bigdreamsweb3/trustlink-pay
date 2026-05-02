import type { PendingAuthSession, UserProfile } from "@/src/lib/types";

const TOKEN_KEY = "trustlink.accessToken";
const USER_KEY = "trustlink.user";
const PENDING_AUTH_KEY = "trustlink.pendingAuth";
const PENDING_SESSION_KEY = "trustlink.pendingSessionReview";

export interface PendingSessionReview {
  sessionId: string;
  sessionCode: string;
  expiresAt: string;
}

export function getStoredToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export function getStoredUser() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as UserProfile) : null;
}

export function setStoredUser(user: UserProfile) {
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredUser() {
  window.localStorage.removeItem(USER_KEY);
}

export function getStoredPendingAuth() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(PENDING_AUTH_KEY);
  return raw ? (JSON.parse(raw) as PendingAuthSession) : null;
}

export function setStoredPendingAuth(session: PendingAuthSession) {
  window.localStorage.setItem(PENDING_AUTH_KEY, JSON.stringify(session));
}

export function clearStoredPendingAuth() {
  window.localStorage.removeItem(PENDING_AUTH_KEY);
}

export function getStoredPendingSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(PENDING_SESSION_KEY);
  return raw ? (JSON.parse(raw) as PendingSessionReview) : null;
}

export function setStoredPendingSession(session: PendingSessionReview) {
  window.localStorage.setItem(PENDING_SESSION_KEY, JSON.stringify(session));
}

export function clearStoredPendingSession() {
  window.localStorage.removeItem(PENDING_SESSION_KEY);
}
