"use client";

import { PublicKey } from "@solana/web3.js";
import {
  DEFAULT_TINS_PROGRAM_ID,
  createOwnerIntentSignatureInstruction,
  createTinOwnerIntentHash,
  decodeTinAccount,
  getTinsGlobalStatePda,
  getTinsIdentityPda,
  getTinsIdentitySeed,
  getTinsRegistryPda,
  serializeTinUpdateParams,
  resolveTIN,
  type TinResolvedIdentity,
} from "@trustlink/tsn-sdk/tins";
import {
  DEFAULT_PRU_COUNT,
  DEFAULT_PRU_PRIVACY_LEVEL,
  computePruConfigurationHash,
  derivePruSet,
  generateTinMasterSeed,
} from "@trustlink/tsn-sdk/pru";
import {
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

import { signAndSendSolanaTransaction, signSolanaBytes, signSolanaMessage } from "@/src/lib/wallet";
import { createSolanaConnection } from "@/src/lib/rpc";
import { traceFunction } from "../../../utils/observability/tracer";
const PHONE_KEY_MESSAGE = "TINS_PHONE_ENCRYPTION_SEED";
const PHONE_KEY_INFO = "TINS_PHONE_KEY_INFO";

export type BrowserTinRegistration = {
  tin: string;
  tinsIdentityPublicKey: string;
  tinsRegistryPublicKey: string;
  tinsWalletPublicKey: string;
  tinsProgramId: string;
  bindingIssuedAt: string;
  bindingMessage: string;
  bindingSignature: string;
  blockchainSignature: string | null;
  created: boolean;
};

export type BrowserTinUpgradeResult = BrowserTinRegistration & {
  upgraded: true;
  pruCount: number;
  privacyLevel: number;
  pruConfigurationHash: string;
  seedBackupFileName: string;
};

function utf8(value: string) {
  return new TextEncoder().encode(value);
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function concatBytes(parts: Uint8Array[]) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
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

function base64ToSignatureBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function triggerJsonDownload(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
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
  const identityPubkey = new PublicKey(buffer.subarray(offset, offset + 32));
  offset += 32;
  let ownerPubkey: PublicKey | null = null;
  if (offset + 32 <= buffer.length) {
    ownerPubkey = new PublicKey(buffer.subarray(offset, offset + 32));
    offset += 32;
  }
  let encryptedPhone = Buffer.alloc(0);
  if (offset + 4 <= buffer.length) {
    const encryptedPhoneLength = buffer.readUInt32LE(offset);
    offset += 4;
    encryptedPhone = buffer.subarray(offset, Math.min(offset + encryptedPhoneLength, buffer.length));
  }
  return { tin, displayName, identityPubkey, ownerPubkey, encryptedPhone };
}

function getFrontendTinsProgramId() {
  return new PublicKey(process.env.NEXT_PUBLIC_TINS_PROGRAM_ID ?? DEFAULT_TINS_PROGRAM_ID);
}

export type BrowserResolvedTin = {
  tin: string;
  name: string | null;
  authority: string;
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
  namespace: "TINS",
  name: "resolveTinFromChain",
  module: "frontend/src/lib/tins.ts",
  level: "debug",
  includeReturn: false,
});

function buildTinBindingMessage(params: {
  userPhoneNumber: string;
  tin: string;
  walletPublicKey: string;
  identityPublicKey: string;
  programId: string;
  issuedAt: string;
}) {
  return [
    "TrustLink Pay TINS phone mapping",
    `Phone: ${params.userPhoneNumber}`,
    `TIN: ${params.tin}`,
    `Wallet: ${params.walletPublicKey}`,
    `Identity: ${params.identityPublicKey}`,
    `Program: ${params.programId}`,
    `Issued At: ${params.issuedAt}`,
  ].join("\n");
}

async function signTinBinding(params: {
  walletId: string;
  walletAddress: string;
  phoneNumber: string;
  tin: string;
  identityPublicKey: string;
  programId: string;
}) {
  const bindingIssuedAt = new Date().toISOString();
  const bindingMessage = buildTinBindingMessage({
    userPhoneNumber: params.phoneNumber,
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

async function encryptPhoneForTins(params: {
  walletId: string;
  walletAddress: string;
  walletPublicKey: PublicKey;
  phoneNumber: string;
}) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("This browser cannot create encrypted TINS phone data.");
  }

  const signatureBase64 = await signSolanaMessage({
    walletId: params.walletId,
    address: params.walletAddress,
    message: PHONE_KEY_MESSAGE,
  });
  const walletSignatureSeed = base64ToBytes(signatureBase64);
  const identitySeed = new Uint8Array(getTinsIdentitySeed(params.walletPublicKey));
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    "raw",
    walletSignatureSeed,
    "HKDF",
    false,
    ["deriveKey"],
  );
  const phoneKey = await globalThis.crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: identitySeed,
      info: utf8(PHONE_KEY_INFO),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      phoneKey,
      utf8(params.phoneNumber),
    ),
  );
  const tag = encrypted.slice(encrypted.length - 16);
  const ciphertext = encrypted.slice(0, encrypted.length - 16);

  return concatBytes([iv, tag, ciphertext]);
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
      throw new Error("The derived TINS identity account is not owned by the configured TINS program.");
    }

    const decoded = decodeTinAccount(existingIdentity.data);
    const tin = decoded.tin.toString();
    const binding = await signTinBinding({
      walletId: params.walletId,
      walletAddress: params.walletAddress,
      phoneNumber: params.phoneNumber,
      tin,
      identityPublicKey: identity.toBase58(),
      programId: programId.toBase58(),
    });
    return {
      tin,
      tinsIdentityPublicKey: identity.toBase58(),
      tinsRegistryPublicKey: getTinsRegistryPda({ tin: decoded.tin, programId }).toBase58(),
      tinsWalletPublicKey: walletPublicKey.toBase58(),
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
    throw new Error("TINS global state is not initialized on devnet yet.");
  }

  throw new Error(
    "New TINS registrations now go through TSN mempool verification. This wallet has no on-chain TINS identity yet, so open Identity Center after the TSN TIN creation queue is enabled.",
  );
}

export const createOrLoadTinForWallet = traceFunction(createOrLoadTinForWalletImpl, {
  namespace: "TINS",
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
}): Promise<BrowserTinUpgradeResult> {
  const programId = getFrontendTinsProgramId();
  const connection = createSolanaConnection({ frontendSafe: true });
  const walletPublicKey = new PublicKey(params.walletAddress);
  const legacyAccountPublicKey = new PublicKey(params.legacyAccountPublicKey);
  const registryPublicKey = getTinsRegistryPda({ tin: params.tin, programId });
  const account = await connection.getAccountInfo(legacyAccountPublicKey, "confirmed");

  if (!account) {
    throw new Error("This TIN is not available for legacy upgrade on the current network.");
  }
  if (!account.owner.equals(programId)) {
    throw new Error("The loaded TIN account is not owned by the configured TINS program.");
  }

  const decoded = decodeLegacyTinUpgradeAccount(account.data);
  if (decoded.tin.toString() !== params.tin) {
    throw new Error("Loaded TIN account does not match the selected TIN.");
  }
  const ownerPublicKey = decoded.ownerPubkey ?? decoded.identityPubkey;
  if (!ownerPublicKey.equals(walletPublicKey)) {
    throw new Error(`Connect the TIN owner wallet ${ownerPublicKey.toBase58()} before upgrading.`);
  }

  const displayName = normalizeDisplayName(params.displayName || decoded.displayName);
  const encryptedPhone = await encryptPhoneForTins({
    walletId: params.walletId,
    walletAddress: params.walletAddress,
    walletPublicKey,
    phoneNumber: params.phoneNumber,
  });

  const tinMasterSeed = generateTinMasterSeed();
  const pruSet = derivePruSet({
    masterSeed: tinMasterSeed,
    tinId: params.tin,
    privacyLevel: DEFAULT_PRU_PRIVACY_LEVEL,
  });
  const pruConfigurationHashHex = computePruConfigurationHash(pruSet);
  const pruConfigurationHash = Buffer.from(pruConfigurationHashHex, "hex");
  const encryptedMetadataHash = new Uint8Array(32);
  const nonce = randomBytes(32);
  const expiryTs = BigInt(Math.floor(Date.now() / 1000) + 900);
  const intentHash = createTinOwnerIntentHash({
    purpose: "update",
    ownerPubkey: walletPublicKey,
    displayName,
    encryptedPhone,
    privacyLevel: DEFAULT_PRU_PRIVACY_LEVEL,
    encryptedMetadataHash,
    pruConfigurationHash,
    nonce,
    expiryTs,
  });
  const ownerSignature = base64ToSignatureBytes(
    await signSolanaBytes({
      walletId: params.walletId,
      address: params.walletAddress,
      message: intentHash,
    }),
  );

  const transaction = new Transaction().add(
    createOwnerIntentSignatureInstruction({
      ownerPubkey: walletPublicKey,
      intentHash,
      signature: ownerSignature,
    }),
    new TransactionInstruction({
      programId,
      keys: [
        { pubkey: walletPublicKey, isSigner: true, isWritable: true },
        { pubkey: legacyAccountPublicKey, isSigner: false, isWritable: true },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: serializeTinUpdateParams({
        ownerPubkey: walletPublicKey,
        displayName,
        encryptedPhone,
        privacyLevel: DEFAULT_PRU_PRIVACY_LEVEL,
        encryptedMetadataHash,
        pruConfigurationHash,
        intentHash,
        expiryTs,
      }),
    }),
  );

  const blockchainSignature = await signAndSendSolanaTransaction({
    walletId: params.walletId,
    address: params.walletAddress,
    rpcUrl: connection.rpcEndpoint,
    transaction,
  });

  const binding = await signTinBinding({
    walletId: params.walletId,
    walletAddress: params.walletAddress,
    phoneNumber: params.phoneNumber,
    tin: params.tin,
    identityPublicKey: legacyAccountPublicKey.toBase58(),
    programId: programId.toBase58(),
  });

  const seedBackupFileName = `trustlink-tin-${params.tin}-master-seed.json`;
  triggerJsonDownload(seedBackupFileName, {
    tin: params.tin,
    owner: params.walletAddress,
    generatedAt: new Date().toISOString(),
    privacyLevel: DEFAULT_PRU_PRIVACY_LEVEL,
    pruCount: DEFAULT_PRU_COUNT,
    pruConfigurationHash: pruConfigurationHashHex,
    tinMasterSeedHex: bytesToHex(tinMasterSeed),
  });

  return {
    tin: params.tin,
    tinsIdentityPublicKey: legacyAccountPublicKey.toBase58(),
    tinsRegistryPublicKey: registryPublicKey.toBase58(),
    tinsWalletPublicKey: walletPublicKey.toBase58(),
    tinsProgramId: programId.toBase58(),
    ...binding,
    blockchainSignature,
    created: false,
    upgraded: true,
    pruCount: DEFAULT_PRU_COUNT,
    privacyLevel: DEFAULT_PRU_PRIVACY_LEVEL,
    pruConfigurationHash: pruConfigurationHashHex,
    seedBackupFileName,
  };
}

export const upgradeLegacyTinForWallet = traceFunction(upgradeLegacyTinForWalletImpl, {
  namespace: "TINS",
  name: "upgradeLegacyTinForWallet",
  module: "frontend/src/lib/tins.ts",
  level: "info",
  includeReturn: false,
});
