"use client";

import { sha256 } from "@noble/hashes/sha2";
import { PublicKey } from "@solana/web3.js";
import { buildTinWalletBindingMessage } from "@trustlink/tsn-sdk/canonical-message";
import {
  DEFAULT_TIP_PROGRAM_ID,
  createTinOwnerIntentHash,
  buildTinOwnerIntentMessage,
  decodeTinAccount,
  getTinsGlobalStatePda,
  getTinsIdentityPda,
  getTinsRegistryPda,
  resolveTIN,
  type TinResolvedIdentity,
} from "@trustlink/tsn-sdk/tins";
import {
  createTinPrivateIdentity,
} from "@trustlink/tsn-sdk/tin-private-controller";
import {
  authorizeCurrentTsnDevice,
  getTinAuthorizedDeviceSigner,
  getTsnDeviceAuthorization,
} from "@/src/lib/tsn-device-authorization";

import {
  signSolanaMessage,
  signTinMasterSeedAuthorizationBytes,
  signTinOwnerIntentMessage,
} from "@/src/lib/wallet";
import { createSolanaConnection } from "@/src/lib/rpc";
import { traceFunction } from "@trustlink/observability/tracer";
import { getBrowserTinAuthorizedDeviceAccess } from "@/src/lib/tin-authorized-device-access";
const TINS_OWNER_INTENT_UPDATE_DOMAIN = "TINS_UPDATE_OWNER_INTENT_V2";

export type BrowserTinRegistration = {
  tin: string;
  tinsIdentityPublicKey: string;
  tinsRegistryPublicKey: string;
  signerPublicKey: string;
  tinsProgramId: string;
  bindingIssuedAt: string;
  bindingMessage: string;
  bindingSignature: string;
  blockchainSignature: string | null;
  created: boolean;
};

export type BrowserTinUpgradeIntent = {
  tin: string;
  ownerPubkey: string;
  displayName: string;
  phoneNumber: string;
  ownerIntentHash: string;
  ownerIntentMessage: string;
  ownerSignature: string;
  nonce: string;
  expiry: number;
  encryptedMasterSeed: string;
  encryptedMetadataHash: string;
  pruConfigurationHash: string;
  encryptedPublicRouteEnvelope: string;
  routeVersion: number;
  routeNonce: string;
};

function utf8(value: string) {
  return new TextEncoder().encode(value);
}

function normalizeDisplayName(value?: string | null) {
  const trimmed = value?.trim() || "TrustLink User";
  return trimmed.length > 32 ? trimmed.slice(0, 32) : trimmed;
}

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToHex(value: Uint8Array) {
  return Array.from(value)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64FromBytes(value: Uint8Array) {
  return btoa(String.fromCharCode(...value));
}

function decodeLegacyTinUpgradeAccount(data: Uint8Array) {
  const buffer = Buffer.from(data);
  let offset = 0;
  const tin = buffer.readBigUInt64LE(offset);
  offset += 8;
  const displayNameLength = buffer.readUInt32LE(offset);
  offset += 4;
  const displayName = buffer.subarray(offset, offset + displayNameLength).toString("utf8");
  offset += displayNameLength;
  const ownerPubkeyHash = buffer.subarray(offset, offset + 32);
  offset += 32;
  let encryptedMasterSeed = Buffer.alloc(0);
  if (offset + 4 <= buffer.length) {
    const encryptedMasterSeedLength = buffer.readUInt32LE(offset);
    offset += 4;
    encryptedMasterSeed = buffer.subarray(offset, Math.min(offset + encryptedMasterSeedLength, buffer.length));
    offset += encryptedMasterSeed.length;
  }
  let createdAt: bigint | null = null;
  if (offset + 8 <= buffer.length) {
    createdAt = buffer.readBigInt64LE(offset);
  }
  return { tin, displayName, ownerPubkeyHash, encryptedMasterSeed, createdAt };
}

function getFrontendTinsProgramId() {
  return new PublicKey(
    process.env.NEXT_PUBLIC_TIP_PROGRAM_ID ??
      process.env.NEXT_PUBLIC_TINS_PROGRAM_ID ??
      DEFAULT_TIP_PROGRAM_ID,
  );
}

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

export type BrowserResolvedTin = {
  tin: string;
  name: string | null;
  authority: string;
  ownerPubkeyHash: string;
  registry: string;
  accountKind: "registry" | "legacy";
  upgradeRequired: boolean;
  upgradeReason: string | null;
  settlementAuthorityVerified: boolean;
  active: boolean;
  createdAt: string;
  socialIdentities: TinResolvedIdentity["socialIdentities"];
  whatsapp: string | null;
  legalName: string | null;
};

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function resolveLegalName(identity: TinResolvedIdentity) {
  for (const social of identity.socialIdentities) {
    const type = social.type.toLowerCase().replace(/[-\s]/g, "_");
    const metadata = metadataRecord(social.metadata);
    if (type === "legal_name" || type === "sas_legal_name") {
      return social.value.trim() || null;
    }
    const legalName = metadata?.legalName;
    if (typeof legalName === "string" && legalName.trim()) {
      return legalName.trim();
    }
  }
  return null;
}

async function resolveTinFromChainImpl(tin: string): Promise<BrowserResolvedTin> {
  const identity = await resolveTIN({
    tin,
    connection: createSolanaConnection({ frontendSafe: true }),
    programId: getFrontendTinsProgramId(),
  });
  const whatsapp =
    identity.socialIdentities.find((item) => item.type.toLowerCase() === "whatsapp")
      ?.value.trim() || null;

  return {
    tin: identity.tin,
    name: identity.name.trim() || null,
    authority: identity.authority.toBase58(),
    ownerPubkeyHash: identity.ownerPubkeyHash,
    registry: identity.registry.toBase58(),
    accountKind: identity.accountKind,
    upgradeRequired: identity.upgradeRequired,
    upgradeReason: identity.upgradeReason,
    settlementAuthorityVerified: identity.settlementAuthorityVerified,
    active: identity.status === 1,
    createdAt: identity.createdAt,
    socialIdentities: identity.socialIdentities,
    whatsapp,
    legalName: resolveLegalName(identity),
  };
}

export const resolveTinFromChain = traceFunction(resolveTinFromChainImpl, {
  namespace: "Transfer Identity",
  name: "resolveTinFromChain",
  module: "frontend/src/lib/tins.ts",
  level: "debug",
  includeReturn: false,
});

export async function fetchTinPruPublicAddresses(params: {
  tin: string;
  ownerPubkeyHash: string;
  signal?: AbortSignal;
}): Promise<TinPruRoutePublicResponse> {
  const response = await fetch(
    `/api/tsn/tin-routes/${encodeURIComponent(params.tin)}/prus`,
    {
      headers: {
        "x-owner-pubkey-hash": params.ownerPubkeyHash,
      },
      signal: params.signal,
    },
  );
  if (!response.ok) {
    throw new Error(`TIN PRU route lookup failed (${response.status})`);
  }
  return response.json() as Promise<TinPruRoutePublicResponse>;
}


async function signTinBinding(params: {
  walletId: string;
  walletAddress: string;
  tin: string;
  identityPublicKey: string;
  programId: string;
}) {
  const bindingIssuedAt = new Date().toISOString();
  const bindingMessage = buildTinWalletBindingMessage({
    tin: params.tin,
    walletPublicKey: params.walletAddress,
    identityPublicKey: params.identityPublicKey,
    programId: params.programId,
    issuedAt: bindingIssuedAt,
  });
  const bindingSignature = await signSolanaMessage({
    walletId: params.walletId,
    address: params.walletAddress,
    message: bindingMessage,
  });

  return { bindingIssuedAt, bindingMessage, bindingSignature };
}

// createTinOwnerUpdateIntentHash removed in favor of SDK createTinOwnerIntentHash

async function postTinOperationIntent(request: BrowserTinUpgradeIntent) {
  const response = await fetch("/api/tsn/tin-operations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      intentType: "tin_update",
      tin: request.tin,
      ownerPubkey: request.ownerPubkey,
      newDisplayName: request.displayName,
      newPhoneNumber: request.phoneNumber,
      ownerIntentHash: request.ownerIntentHash,
      ownerIntentMessage: request.ownerIntentMessage,
      ownerSignature: request.ownerSignature,
      nonce: request.nonce,
      expiry: request.expiry,
      newEncryptedMasterSeed: request.encryptedMasterSeed,
      newEncryptedMetadataHash: request.encryptedMetadataHash,
      newPruConfigurationHash: request.pruConfigurationHash,
      newEncryptedPublicRouteEnvelope: request.encryptedPublicRouteEnvelope,
      newRouteVersion: request.routeVersion,
      newRouteNonce: request.routeNonce,
    }),
  });

  const raw = await response.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = raw;
  }
  if (!response.ok) {
    const detail =
      parsed && typeof parsed === "object"
        ? (["detail", "error", "message", "reason"] as const)
            .map((key) => (parsed as Record<string, unknown>)[key])
            .find(
              (value): value is string =>
                typeof value === "string" && Boolean(value.trim()),
            )
        : null;
    throw new Error(detail ?? "TSN Receiver rejected the TIN upgrade intent.");
  }
  if (!parsed || typeof parsed !== "object" || !("intentId" in parsed)) {
    throw new Error("TSN mempool accepted the TIN upgrade intent but returned no intent id.");
  }
  return { intentId: String((parsed as { intentId: unknown }).intentId) };
}

async function createOrLoadTinForWalletImpl(params: {
  walletId: string;
  walletAddress: string;
  phoneNumber: string;
  displayName?: string | null;
}): Promise<BrowserTinRegistration> {
  const programId = getFrontendTinsProgramId();
  const connection = createSolanaConnection({ frontendSafe: true });
  const walletPublicKey = new PublicKey(params.walletAddress);
  const identity = getTinsIdentityPda({ walletPubkey: walletPublicKey, programId });
  const existingIdentity = await connection.getAccountInfo(identity, "confirmed");

  if (existingIdentity) {
    if (!existingIdentity.owner.equals(programId)) {
      throw new Error("The derived Transfer Identity account is not owned by the configured Transfer Identity program.");
    }

    const decoded = decodeTinAccount(existingIdentity.data);
    const tin = decoded.tin.toString();
    const binding = await signTinBinding({
      walletId: params.walletId,
      walletAddress: params.walletAddress,
      tin,
      identityPublicKey: identity.toBase58(),
      programId: programId.toBase58(),
    });
    return {
      tin,
      tinsIdentityPublicKey: identity.toBase58(),
      tinsRegistryPublicKey: getTinsRegistryPda({ tin: decoded.tin, programId }).toBase58(),
      signerPublicKey: walletPublicKey.toBase58(),
      tinsProgramId: programId.toBase58(),
      ...binding,
      blockchainSignature: null,
      created: false,
    };
  }

  const globalState = await connection.getAccountInfo(
    getTinsGlobalStatePda(programId),
    "confirmed",
  );
  if (!globalState) {
    throw new Error("Transfer Identity global state is not initialized on devnet yet.");
  }

  throw new Error(
    "New Transfer Identity registrations now go through TSN mempool verification. This wallet has no on-chain Transfer Identity yet, so open Identity Center after the TSN TIN creation queue is enabled.",
  );
}

export const createOrLoadTinForWallet = traceFunction(createOrLoadTinForWalletImpl, {
  namespace: "Transfer Identity",
  name: "createOrLoadTinForWallet",
  module: "frontend/src/lib/tins.ts",
  level: "info",
  includeReturn: false,
});

async function upgradeLegacyTinForWalletImpl(params: {
  walletId: string;
  walletAddress: string;
  tin: string;
  phoneNumber: string;
  displayName?: string | null;
  legacyAccountPublicKey: string;
}): Promise<{ intentId: string }> {
  const programId = getFrontendTinsProgramId();
  const connection = createSolanaConnection({ frontendSafe: true });
  const walletPublicKey = new PublicKey(params.walletAddress);
  const legacyAccountPublicKey = new PublicKey(params.legacyAccountPublicKey);
  const account = await connection.getAccountInfo(legacyAccountPublicKey, "confirmed");

  if (!account) {
    throw new Error("This TIN is not available for legacy upgrade on the current network.");
  }
  if (!account.owner.equals(programId)) {
    throw new Error("The loaded TIN account is not owned by the configured Transfer Identity program.");
  }

  const decoded = decodeLegacyTinUpgradeAccount(account.data);
  if (decoded.tin.toString() !== params.tin) {
    throw new Error("Loaded TIN account does not match the selected TIN.");
  }
  const expectedIdentityPublicKey = getTinsIdentityPda({ walletPubkey: walletPublicKey, programId });
  if (!legacyAccountPublicKey.equals(expectedIdentityPublicKey)) {
    throw new Error(
      `Connect the wallet that controls this legacy TIN before upgrading. Owner commitment: ${bytesToHex(decoded.ownerPubkeyHash)}.`,
    );
  }

  const displayName = normalizeDisplayName(params.displayName || decoded.displayName);
  const nonce = randomBytes(32);
  const routeNonce = randomBytes(32);
  const routeVersion = 1;
  const expiryTs = BigInt(Math.floor(Date.now() / 1000) + 900);
  const routeKeyResponse = await fetch("/api/tsn/tin-route-key", {
    cache: "no-store",
  });
  if (!routeKeyResponse.ok) {
    const detail = await routeKeyResponse.text().catch(() => "");
    throw new Error(
      detail.trim()
        ? `The TSN Node routing encryption key is unavailable: ${detail.slice(0, 240)}`
        : "The TSN Node routing encryption key is unavailable.",
    );
  }
  const routeKey = await routeKeyResponse.json() as {
    algorithm: string;
    publicKey: string;
  };
  // A legacy TIN has no TSN private envelope yet. The upgrade action is the
  // explicit owner approval point: authorize this device for this access
  // request, then create the local device envelope. The long-lived TIN
  // encryption is independent of the device key, which only unwraps the
  // response locally. No Solana transaction is requested for this step; both
  // approvals are detached wallet messages.
  if (!await getTsnDeviceAuthorization(params.tin)) {
    await authorizeCurrentTsnDevice({
      tin: params.tin,
      walletSession: {
        walletId: params.walletId,
        walletName: "Connected wallet",
        address: params.walletAddress,
      },
    });
  }
  const privateIdentity = await createTinPrivateIdentity({
    tin: params.tin,
    routeVersion,
    routeNonce: bytesToHex(routeNonce),
    ownerWallet: {
      publicKey: params.walletAddress,
      signMessage: (message) => signTinMasterSeedAuthorizationBytes({
        walletId: params.walletId,
        address: params.walletAddress,
        message,
      }),
    },
    authorizedDevice: await getTinAuthorizedDeviceSigner(params.tin),
    thresholdProvider: await getBrowserTinAuthorizedDeviceAccess(),
    nodeRoutingPublicKeyBase64: routeKey.publicKey,
  });
  const {
    pruConfigurationHash,
    encryptedMasterSeed,
    encryptedPublicRouteEnvelope,
  } = privateIdentity;
  const encryptedMetadataHash = sha256(utf8(
    `TSN_TIN_PRIVATE_METADATA|${params.tin}|${walletPublicKey.toBase58()}|${displayName}|${params.phoneNumber}`,
  ));
  const intentHash = createTinOwnerIntentHash({
    purpose: "update",
    ownerPubkey: walletPublicKey,
    displayName,
    encryptedMasterSeed,
    encryptedMetadataHash,
    pruConfigurationHash: Buffer.from(pruConfigurationHash, "hex"),
    encryptedPublicRouteEnvelope,
    routeVersion,
    routeNonce,
    nonce,
    expiryTs,
  });
  const ownerIntentMessageBytes = buildTinOwnerIntentMessage(intentHash);
  const ownerSignature = await signTinOwnerIntentMessage({
    walletId: params.walletId,
    address: params.walletAddress,
    message: ownerIntentMessageBytes,
  });
  const queued = await postTinOperationIntent(
    {
      tin: params.tin,
      ownerPubkey: walletPublicKey.toBase58(),
      displayName,
      phoneNumber: params.phoneNumber,
      ownerIntentHash: bytesToHex(intentHash),
      ownerIntentMessage: new TextDecoder().decode(ownerIntentMessageBytes),
      ownerSignature: base64FromBytes(ownerSignature),
      nonce: bytesToHex(nonce),
      expiry: Number(expiryTs),
      encryptedMasterSeed: base64FromBytes(encryptedMasterSeed),
      encryptedMetadataHash: bytesToHex(encryptedMetadataHash),
      pruConfigurationHash,
      encryptedPublicRouteEnvelope: base64FromBytes(encryptedPublicRouteEnvelope),
      routeVersion,
      routeNonce: bytesToHex(routeNonce),
    } satisfies BrowserTinUpgradeIntent,
  );
  return queued;
}

export const upgradeLegacyTinForWallet = traceFunction(upgradeLegacyTinForWalletImpl, {
  namespace: "Transfer Identity",
  name: "upgradeLegacyTinForWallet",
  module: "frontend/src/lib/tins.ts",
  level: "info",
  includeReturn: false,
});
