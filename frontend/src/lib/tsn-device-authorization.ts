"use client";

import {
  authorizeDevice,
  createTinCommitment,
} from "@trustlink/tsn-sdk/authorization";
import type { TinAuthorizedDeviceSigner } from "@trustlink/tsn-sdk/tin-device-access";
import { unwrapTinThresholdKeyOnDevice } from "@trustlink/tsn-sdk/tin-device-key-envelope";
import {
  generateNonExportableDeviceCredentials,
  type NonExportableDeviceCredentials,
} from "@trustlink/tsn-sdk/device";
import {
  signSessionProof,
  TSN_SESSION_PROOF_DOMAIN,
  TSN_SESSION_PROOF_VERSION,
} from "@trustlink/tsn-sdk/sessions/proof-of-possession";
import {
  createPrivateSessionRequestCommitment,
} from "@trustlink/tsn-sdk/sessions/private-session-request";
import {
  decryptPrivateReceiptForAuthorizedKey,
  encryptPrivateReceipt,
  type EncryptedReceiptRecord,
} from "@trustlink/tsn-sdk/receipts";
import { configureTsnPrivateValueResolver } from "@trustlink/tsn-sdk/private-view";
import { buildBackendUrl } from "@/src/lib/backend";
import {
  signTsnDeviceAuthorizationBytes,
  type ConnectedWalletSession,
} from "@/src/lib/wallet";

const DB_NAME = "trustlink-tsn-device-v1";
const STORE_NAME = "credentials";
const RECORD_KEY = "active-device";

export type StoredTsnDevice = NonExportableDeviceCredentials & {
  deviceId: string;
  authorizedTin: string | null;
  authorizedWallet: string | null;
  authorizedAt: string | null;
  authorizedPermissions?: string[];
  privateIdentity?: EncryptedReceiptRecord | null;
};

const PRIVATE_DEVICE_PERMISSIONS = [
  "private-session:create",
  "private-receipt:read",
  "private-history:read",
  "private-balance:read",
  "private-settlement:read",
  "device:revoke",
] as const;

export type ActiveTsnPrivateSession = {
  sessionId: string;
  sessionToken: string;
  deviceId: string;
  permissions: string[];
  audience: string;
  expiresAt: string;
};

let activePrivateSession: ActiveTsnPrivateSession | null = null;

function randomBase64Url(byteLength: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : "TSN private request failed");
  }
  return body as T;
}

function openVault() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open device key vault"));
  });
}

async function readDevice(): Promise<StoredTsnDevice | null> {
  const db = await openVault();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(RECORD_KEY);
      request.onsuccess = () => resolve((request.result as StoredTsnDevice | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Could not read device credentials"));
    });
  } finally {
    db.close();
  }
}

async function writeDevice(device: StoredTsnDevice) {
  const db = await openVault();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(device, RECORD_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Could not store device credentials"));
    });
  } finally {
    db.close();
  }
}

export async function getOrCreateTsnDevice(): Promise<StoredTsnDevice> {
  const existing = await readDevice();
  if (existing) return existing;
  const credentials = await generateNonExportableDeviceCredentials();
  const created: StoredTsnDevice = {
    ...credentials,
    deviceId: crypto.randomUUID(),
    authorizedTin: null,
    authorizedWallet: null,
    authorizedAt: null,
  };
  await writeDevice(created);
  return created;
}

export async function getTinAuthorizedDeviceSigner(
  tin?: string,
): Promise<TinAuthorizedDeviceSigner> {
  const device = tin
    ? await getTsnDeviceAuthorization(tin)
    : await getOrCreateTsnDevice();
  if (!device) {
    throw new Error("This device must be authorized by the TIN owner wallet before private access");
  }
  return {
    deviceId: device.deviceId,
    signingPublicKey: device.signing.publicKey,
    signingKeyFingerprint: device.signing.fingerprint,
    encryptionPublicKey: device.encryption.publicKey,
    encryptionKeyFingerprint: device.encryption.keyId,
    signMessage: async (message) => {
      const bytes = new Uint8Array(message);
      return new Uint8Array(await crypto.subtle.sign(
        "Ed25519",
        device.signing.privateKey,
        bytes.buffer,
      ));
    },
    unwrapThresholdKey: (envelope, proof) =>
      unwrapTinThresholdKeyOnDevice({
        envelope,
        proof,
        deviceEncryptionPrivateKey: device.encryption.privateKey,
      }),
  };
}

export async function getTsnDeviceAuthorization(tin: string) {
  const device = await readDevice();
  return device?.authorizedTin === tin ? device : null;
}

export async function authorizeCurrentTsnDevice(params: {
  tin: string;
  walletSession: ConnectedWalletSession;
}) {
  const device = await getOrCreateTsnDevice();
  await authorizeDevice({
    authorizationServiceUrl: buildBackendUrl(""),
    tin: params.tin,
    deviceId: device.deviceId,
    signingPublicKey: device.signing.publicKey,
    encryptionPublicKey: device.encryption.publicKey,
    permissions: [...PRIVATE_DEVICE_PERMISSIONS],
    historyRecoveryScope: "all",
    wallet: {
      publicKey: params.walletSession.address,
      signMessage: (message) =>
        signTsnDeviceAuthorizationBytes({
          walletId: params.walletSession.walletId,
          address: params.walletSession.address,
          message,
        }),
    },
  });
  const authorized: StoredTsnDevice = {
    ...device,
    authorizedTin: params.tin,
    authorizedWallet: params.walletSession.address,
    authorizedAt: new Date().toISOString(),
    authorizedPermissions: [...PRIVATE_DEVICE_PERMISSIONS],
  };
  await writeDevice(authorized);
  await ensureEncryptedPrivateIdentity(authorized);
  return authorized;
}

async function ensureEncryptedPrivateIdentity(device: StoredTsnDevice) {
  if (device.privateIdentity) {
    if (!device.authorizedWallet) return device;
    const cleared = { ...device, authorizedWallet: null };
    await writeDevice(cleared);
    return cleared;
  }
  if (!device.authorizedTin || !device.authorizedWallet) {
    throw new Error("The authorized settlement wallet is unavailable for private migration");
  }
  const record = await encryptPrivateReceipt({
    receiptId: crypto.randomUUID(),
    operationId: `tsn-private-identity-v1:${device.authorizedTin}`,
    tinCommitment: await createTinCommitment(device.authorizedTin),
    plaintext: new TextEncoder().encode(JSON.stringify({
      settlementWallet: device.authorizedWallet,
    })),
    recipients: [{
      recipientKeyId: device.encryption.keyId,
      recipientType: "device",
      encryptionPublicKey: device.encryption.publicKey,
    }],
  });
  const migrated: StoredTsnDevice = {
    ...device,
    authorizedWallet: null,
    privateIdentity: record,
  };
  await writeDevice(migrated);
  return migrated;
}

export async function readAutomaticPrivateIdentity(tin: string) {
  if (!getActiveTsnPrivateSession()) {
    throw new Error("A Private View session is required");
  }
  const stored = await getTsnDeviceAuthorization(tin);
  if (!stored) throw new Error("This device is not authorized for this TIN");
  const device = await ensureEncryptedPrivateIdentity(stored);
  if (!device.privateIdentity) throw new Error("Private identity data is unavailable");
  const plaintext = await decryptPrivateReceiptForAuthorizedKey({
    record: device.privateIdentity,
    recipientKeyId: device.encryption.keyId,
    recipientPrivateKey: device.encryption.privateKey,
  });
  try {
    return JSON.parse(new TextDecoder().decode(plaintext)) as {
      settlementWallet: string;
    };
  } finally {
    plaintext.fill(0);
  }
}

configureTsnPrivateValueResolver(async ({ tin, field }) => {
  await createTsnPrivateSession(tin);
  const identity = await readAutomaticPrivateIdentity(tin);
  return identity[field] || null;
});

export function clearActiveTsnPrivateSession() {
  activePrivateSession = null;
}

export function getActiveTsnPrivateSession() {
  if (!activePrivateSession) return null;
  if (Date.parse(activePrivateSession.expiresAt) <= Date.now()) {
    activePrivateSession = null;
    return null;
  }
  return activePrivateSession;
}

export async function createTsnPrivateSession(tin: string) {
  const current = getActiveTsnPrivateSession();
  if (current) return current;
  const device = await getTsnDeviceAuthorization(tin);
  if (!device) throw new Error("This device is not authorized for this TIN");

  const now = Date.now();
  const context = await readResponse<{ audience: string }>(
    await fetch(buildBackendUrl("/api/tsn/privacy/context"), { cache: "no-store" }),
  );
  const request = {
    sessionId: crypto.randomUUID(),
    deviceId: device.deviceId,
    sessionToken: randomBase64Url(32),
    permissions: [
      "private-receipt:read",
      "private-history:read",
      "private-balance:read",
      "private-settlement:read",
    ],
    audience: context.audience,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
  };
  const proofIssuedAt = new Date().toISOString();
  const proof = await signSessionProof(
    {
      protocolVersion: TSN_SESSION_PROOF_VERSION,
      domain: TSN_SESSION_PROOF_DOMAIN,
      sessionId: request.sessionId,
      deviceId: request.deviceId,
      deviceSigningKeyFingerprint: device.signing.fingerprint,
      permission: "private-session:create",
      method: "POST",
      resource: "/api/tsn/privacy/sessions",
      bodyCommitment: await createPrivateSessionRequestCommitment(request),
      nonce: randomBase64Url(32),
      issuedAt: proofIssuedAt,
      expiresAt: new Date(Date.parse(proofIssuedAt) + 5 * 60 * 1000).toISOString(),
      audience: request.audience,
    },
    device.signing.privateKey,
  );
  await readResponse(await fetch(buildBackendUrl("/api/tsn/privacy/sessions"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...request, proof }),
  }));
  activePrivateSession = request;
  return request;
}
