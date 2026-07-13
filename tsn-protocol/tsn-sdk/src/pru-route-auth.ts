import {
  buildPruRouteSessionMessage,
  parsePruRouteSessionMessage,
} from "./canonical-message.js";

export type PruRouteProofPurpose =
  | "pru_route_lookup"
  | "delegate_read_access"
  | "revoke_read_access";

export type PruRouteSigningWallet = {
  publicKey: string | { toString(): string };
  signMessage: (message: Uint8Array) => Promise<Uint8Array | { signature: Uint8Array | number[] } | string>;
};

export type PruRouteProof = {
  tin: string;
  purpose: PruRouteProofPurpose;
  ownerPubkey: string;
  nonce: string;
  timestamp: number;
  platformReadKey?: string;
  expiry?: number;
};

export type PruRouteSession = {
  token: string;
  expiresAt: number;
  tin: string;
};

export type TinPruPublicAddress = {
  index: number;
  publicKey: string;
  state: string;
};

export type TinPruRoutePublicResponse = {
  tin: string;
  pruConfigurationHash: string;
  status: "finalized";
  prus: TinPruPublicAddress[];
};

export class PruRouteAuthorizationError extends Error {
  readonly status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "PruRouteAuthorizationError";
    this.status = status;
  }
}

const TEXT_ENCODER = new TextEncoder();
const sessionStore = new Map<string, PruRouteSession>();
const pendingRouteLoads = new Map<string, Promise<TinPruRoutePublicResponse>>();

function normalizeMempoolUrl(mempoolUrl: string) {
  const trimmed = mempoolUrl.trim();
  if (!trimmed) throw new Error("mempoolUrl is required");
  return trimmed.replace(/\/$/, "");
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function getWalletPublicKey(wallet: PruRouteSigningWallet) {
  return typeof wallet.publicKey === "string"
    ? wallet.publicKey
    : wallet.publicKey.toString();
}

function getSessionKey(tin: string | number, ownerPubkey: string, mempoolUrl: string) {
  return [normalizeMempoolUrl(mempoolUrl), String(tin), ownerPubkey].join(":");
}

function createNonce() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function encodeBase64(value: Uint8Array) {
  if (typeof Buffer !== "undefined") return Buffer.from(value).toString("base64");
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function normalizeSignature(value: Uint8Array | { signature: Uint8Array | number[] } | string) {
  if (typeof value === "string") return value;
  const signature = value instanceof Uint8Array ? value : Uint8Array.from(value.signature);
  return encodeBase64(signature);
}

export function encodePruRouteProofMessage(proof: PruRouteProof) {
  const purpose =
    proof.purpose === "pru_route_lookup"
      ? "Load TIN Balance"
      : proof.purpose === "delegate_read_access"
        ? "Delegate Balance Access"
        : "Revoke Balance Access";
  return TEXT_ENCODER.encode(
    buildPruRouteSessionMessage({
      tin: proof.tin,
      purpose,
      nonce: proof.nonce,
      expires: new Date((proof.expiry ?? proof.timestamp + 300) * 1000).toISOString(),
    }),
  );
}

export function decodePruRouteProofMessage(message: Uint8Array | string) {
  return parsePruRouteSessionMessage(
    typeof message === "string" ? message : new TextDecoder().decode(message),
  );
}

export function buildPruRouteProof(tin: string | number, walletPublicKey: string): PruRouteProof {
  return {
    tin: String(tin),
    purpose: "pru_route_lookup",
    ownerPubkey: walletPublicKey,
    nonce: createNonce(),
    timestamp: nowSeconds(),
  };
}

function getSession(tin: string | number, ownerPubkey: string, mempoolUrl: string) {
  const sessionKey = getSessionKey(tin, ownerPubkey, mempoolUrl);
  const session = sessionStore.get(sessionKey);
  if (!session || session.expiresAt <= nowSeconds() + 30) {
    sessionStore.delete(sessionKey);
    return null;
  }
  return session;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { detail?: unknown };
  if (!response.ok) {
    const message = typeof body.detail === "string"
      ? body.detail
      : "PRU route authorization failed";
    throw new PruRouteAuthorizationError(message, response.status);
  }
  return body as T;
}

export async function requestPruRouteSession(
  tin: string | number,
  wallet: PruRouteSigningWallet,
  mempoolUrl: string,
) {
  const ownerPubkey = getWalletPublicKey(wallet);
  const proof = buildPruRouteProof(tin, ownerPubkey);
  const message = encodePruRouteProofMessage(proof);
  const signature = normalizeSignature(await wallet.signMessage(message));
  const response = await fetch(`${normalizeMempoolUrl(mempoolUrl)}/tin-routes/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tin: proof.tin,
      owner_pubkey: ownerPubkey,
      signature,
      nonce: proof.nonce,
      timestamp: proof.timestamp,
      signed_message_base64: encodeBase64(message),
    }),
  });
  const session = await parseJsonResponse<PruRouteSession>(response);
  sessionStore.set(getSessionKey(session.tin, ownerPubkey, mempoolUrl), session);
  return session.token;
}

export async function getPruRouteWithSession(
  tin: string | number,
  wallet: PruRouteSigningWallet,
  mempoolUrl: string,
) {
  const tinKey = String(tin);
  const sessionKey = getSessionKey(tinKey, getWalletPublicKey(wallet), mempoolUrl);
  const session = sessionStore.get(sessionKey);
  if (!session || session.expiresAt <= nowSeconds() + 30) {
    sessionStore.delete(sessionKey);
    return null;
  }
  const response = await fetch(
    `${normalizeMempoolUrl(mempoolUrl)}/tin-routes/${encodeURIComponent(tinKey)}/prus`,
    {
      headers: { authorization: `Bearer ${session.token}` },
    },
  );
  if (response.status === 401 || response.status === 403) {
    sessionStore.delete(sessionKey);
  }
  return parseJsonResponse<TinPruRoutePublicResponse>(response);
}

export async function loadPruRoute(
  tin: string | number,
  wallet: PruRouteSigningWallet,
  mempoolUrl: string,
) {
  const existing = await getPruRouteWithSession(tin, wallet, mempoolUrl);
  if (existing) return existing;
  const loadKey = [
    normalizeMempoolUrl(mempoolUrl),
    String(tin),
    getWalletPublicKey(wallet),
  ].join(":");
  const pendingLoad = pendingRouteLoads.get(loadKey);
  if (pendingLoad) return pendingLoad;

  const routeLoad = (async () => {
    await requestPruRouteSession(tin, wallet, mempoolUrl);
    const route = await getPruRouteWithSession(tin, wallet, mempoolUrl);
    if (!route) {
      throw new PruRouteAuthorizationError(
        "Sign to load your TIN balance. This does not cost any fees and does not send a transaction.",
      );
    }
    return route;
  })();
  pendingRouteLoads.set(loadKey, routeLoad);

  try {
    return await routeLoad;
  } finally {
    if (pendingRouteLoads.get(loadKey) === routeLoad) {
      pendingRouteLoads.delete(loadKey);
    }
  }
}

function buildDelegationProof(params: {
  tin: string | number;
  ownerPubkey: string;
  platformReadKey: string;
  purpose: "delegate_read_access" | "revoke_read_access";
  expiry?: number;
}) {
  return {
    tin: String(params.tin),
    purpose: params.purpose,
    ownerPubkey: params.ownerPubkey,
    platformReadKey: params.platformReadKey,
    nonce: createNonce(),
    timestamp: nowSeconds(),
    expiry: params.expiry,
  } satisfies PruRouteProof;
}

export async function grantDelegatedReadAccess(
  tin: string | number,
  wallet: PruRouteSigningWallet,
  platformReadKey: string,
  mempoolUrl: string,
  durationSeconds = 30 * 24 * 60 * 60,
) {
  const ownerPubkey = getWalletPublicKey(wallet);
  const proof = buildDelegationProof({
    tin,
    ownerPubkey,
    platformReadKey,
    purpose: "delegate_read_access",
    expiry: nowSeconds() + durationSeconds,
  });
  const signature = normalizeSignature(await wallet.signMessage(encodePruRouteProofMessage(proof)));
  const response = await fetch(`${normalizeMempoolUrl(mempoolUrl)}/tin-routes/delegate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...proof,
      owner_pubkey: ownerPubkey,
      platform_read_key: platformReadKey,
      signature,
      signed_message_base64: encodeBase64(encodePruRouteProofMessage(proof)),
    }),
  });
  return parseJsonResponse<{ tin: string; platformReadKey: string; expiresAt: number; status: "active" }>(response);
}

export async function revokeDelegatedReadAccess(
  tin: string | number,
  wallet: PruRouteSigningWallet,
  platformReadKey: string,
  mempoolUrl: string,
) {
  const ownerPubkey = getWalletPublicKey(wallet);
  const proof = buildDelegationProof({
    tin,
    ownerPubkey,
    platformReadKey,
    purpose: "revoke_read_access",
  });
  const signature = normalizeSignature(await wallet.signMessage(encodePruRouteProofMessage(proof)));
  const response = await fetch(`${normalizeMempoolUrl(mempoolUrl)}/tin-routes/delegate`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...proof,
      owner_pubkey: ownerPubkey,
      platform_read_key: platformReadKey,
      signature,
      signed_message_base64: encodeBase64(encodePruRouteProofMessage(proof)),
    }),
  });
  return parseJsonResponse<{ tin: string; platformReadKey: string; status: "revoked" }>(response);
}

export async function listDelegatedPlatforms(
  tin: string | number,
  wallet: PruRouteSigningWallet,
  mempoolUrl: string,
) {
  await loadPruRoute(tin, wallet, mempoolUrl);
  const session = getSession(String(tin), getWalletPublicKey(wallet), mempoolUrl);
  if (!session) throw new PruRouteAuthorizationError("PRU route session is required");
  const response = await fetch(
    `${normalizeMempoolUrl(mempoolUrl)}/tin-routes/${encodeURIComponent(String(tin))}/delegations`,
    { headers: { authorization: `Bearer ${session.token}` } },
  );
  return parseJsonResponse<Array<{ platformReadKey: string; contact: string | null; expiresAt: number }>>(response);
}
