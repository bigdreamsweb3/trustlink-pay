import {
  clearStoredPendingAuth,
  clearStoredToken,
  clearStoredUser,
} from "@/src/lib/storage";
import { buildBackendUrl } from "@/src/lib/backend";

type ApiCacheMode = "default" | "no-store";

type ApiCacheOptions = {
  cache?: ApiCacheMode;
  ttlMs?: number;
  cacheKey?: string;
};

type ApiCacheEntry = {
  expiresAt: number;
  value?: unknown;
  promise?: Promise<unknown>;
};

const DEFAULT_GET_TTL_MS = 20_000;
const DEFAULT_POST_READ_TTL_MS = 30_000;
const apiResponseCache = new Map<string, ApiCacheEntry>();

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

function authScope(accessToken?: string) {
  if (!accessToken) {
    return "public";
  }

  return `auth:${accessToken.slice(0, 16)}`;
}

function buildCacheKey(params: {
  method: "GET" | "POST";
  path: string;
  accessToken?: string;
  body?: unknown;
  cacheKey?: string;
}) {
  if (params.cacheKey) {
    return params.cacheKey;
  }

  return [
    params.method,
    params.path,
    authScope(params.accessToken),
    params.body === undefined ? "" : stableStringify(params.body),
  ].join("::");
}

async function readThroughCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
) {
  const now = Date.now();
  const existing = apiResponseCache.get(key);

  if (existing) {
    if (existing.value !== undefined && existing.expiresAt > now) {
      return existing.value as T;
    }

    if (existing.promise) {
      return existing.promise as Promise<T>;
    }
  }

  const promise = loader()
    .then((value) => {
      apiResponseCache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
      return value;
    })
    .catch((error) => {
      apiResponseCache.delete(key);
      throw error;
    });

  apiResponseCache.set(key, {
    promise,
    expiresAt: now + ttlMs,
  });

  return promise;
}

export function invalidateApiCache(predicate?: (key: string) => boolean) {
  if (!predicate) {
    apiResponseCache.clear();
    return;
  }

  for (const key of apiResponseCache.keys()) {
    if (predicate(key)) {
      apiResponseCache.delete(key);
    }
  }
}

function invalidateAfterMutation(path: string) {
  if (
    path.startsWith("/api/payment") ||
    path.startsWith("/api/identity") ||
    path.startsWith("/api/receiver-wallets") ||
    path.startsWith("/api/settings")
  ) {
    invalidateApiCache();
  }
}

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
      error: response.ok
        ? "Unexpected response from server"
        : "Server error. Please try again.",
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

  return /access token|invalid token|expired token|missing token|session secret/i.test(
    errorMessage,
  );
}

function handleSessionFailure(
  status: number,
  errorMessage: string | undefined,
) {
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

export async function apiPost<T>(
  path: string,
  body: unknown,
  accessToken?: string,
  options: ApiCacheOptions = {},
): Promise<T> {
  const load = async () => {
    const response = await fetch(buildBackendUrl(path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });

    const payload = (await parseResponse(response)) as { error?: string } | null;

    if (!response.ok) {
      handleSessionFailure(response.status, payload?.error);
      throw new Error(payload?.error ?? "Request failed");
    }

    return payload as T;
  };

  if (options.cache === "default") {
    const cacheKey = buildCacheKey({
      method: "POST",
      path,
      body,
      accessToken,
      cacheKey: options.cacheKey,
    });
    return readThroughCache(cacheKey, options.ttlMs ?? DEFAULT_POST_READ_TTL_MS, load);
  }

  const result = await load();
  invalidateAfterMutation(path);
  return result;
}

export async function apiGet<T>(
  path: string,
  accessToken?: string,
  options: ApiCacheOptions = {},
): Promise<T> {
  const load = async () => {
    const response = await fetch(buildBackendUrl(path), {
      method: "GET",
      headers: accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : undefined,
    });

    const payload = (await parseResponse(response)) as { error?: string } | null;

    if (!response.ok) {
      handleSessionFailure(response.status, payload?.error);
      throw new Error(payload?.error ?? "Request failed");
    }

    return payload as T;
  };

  if (options.cache === "no-store") {
    return load();
  }

  const cacheKey = buildCacheKey({
    method: "GET",
    path,
    accessToken,
    cacheKey: options.cacheKey,
  });
  return readThroughCache(cacheKey, options.ttlMs ?? DEFAULT_GET_TTL_MS, load);
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
  accessToken?: string,
): Promise<T> {
  const response = await fetch(buildBackendUrl(path), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const payload = (await parseResponse(response)) as { error?: string } | null;

  if (!response.ok) {
    handleSessionFailure(response.status, payload?.error);
    throw new Error(payload?.error ?? "Request failed");
  }

  invalidateAfterMutation(path);
  return payload as T;
}

export async function apiDelete<T>(
  path: string,
  accessToken?: string,
): Promise<T> {
  const response = await fetch(buildBackendUrl(path), {
    method: "DELETE",
    headers: accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : undefined,
  });

  const payload = (await parseResponse(response)) as { error?: string } | null;

  if (!response.ok) {
    handleSessionFailure(response.status, payload?.error);
    throw new Error(payload?.error ?? "Request failed");
  }

  invalidateAfterMutation(path);
  return payload as T;
}
