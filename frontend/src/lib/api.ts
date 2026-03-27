import { clearStoredPendingAuth, clearStoredToken, clearStoredUser } from "@/src/lib/storage";

async function parseResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const raw = await response.text();

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {
      error: response.ok ? "Unexpected response from server" : "Server error. Please try again."
    };
  }
}

function isSessionFailure(status: number, errorMessage: string | undefined) {
  if (status === 401) {
    return true;
  }

  if (!errorMessage) {
    return false;
  }

  return /access token|invalid token|expired token|missing token|session secret/i.test(errorMessage);
}

function handleSessionFailure(status: number, errorMessage: string | undefined) {
  if (!isSessionFailure(status, errorMessage)) {
    return;
  }

  if (typeof window === "undefined") {
    return;
  }

  clearStoredPendingAuth();
  clearStoredToken();
  clearStoredUser();

  const nextLocation = `/auth?mode=login&reason=${encodeURIComponent("session_expired")}`;
  if (window.location.pathname !== "/auth") {
    window.location.replace(nextLocation);
  }
}

export async function apiPost<T>(path: string, body: unknown, accessToken?: string): Promise<T> {
  const response = await fetch(`/backend${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify(body)
  });

  const payload = await parseResponse(response) as { error?: string } | null;

  if (!response.ok) {
    handleSessionFailure(response.status, payload?.error);
    throw new Error(payload?.error ?? "Request failed");
  }

  return payload as T;
}

export async function apiGet<T>(path: string, accessToken?: string): Promise<T> {
  const response = await fetch(`/backend${path}`, {
    method: "GET",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    cache: "no-store"
  });

  const payload = await parseResponse(response) as { error?: string } | null;

  if (!response.ok) {
    handleSessionFailure(response.status, payload?.error);
    throw new Error(payload?.error ?? "Request failed");
  }

  return payload as T;
}

export async function apiPatch<T>(path: string, body: unknown, accessToken?: string): Promise<T> {
  const response = await fetch(`/backend${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify(body)
  });

  const payload = await parseResponse(response) as { error?: string } | null;

  if (!response.ok) {
    handleSessionFailure(response.status, payload?.error);
    throw new Error(payload?.error ?? "Request failed");
  }

  return payload as T;
}

export async function apiDelete<T>(path: string, accessToken?: string): Promise<T> {
  const response = await fetch(`/backend${path}`, {
    method: "DELETE",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
  });

  const payload = await parseResponse(response) as { error?: string } | null;

  if (!response.ok) {
    handleSessionFailure(response.status, payload?.error);
    throw new Error(payload?.error ?? "Request failed");
  }

  return payload as T;
}
