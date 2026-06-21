"use client";

import { Connection, PublicKey } from "@solana/web3.js";
import {
  DEFAULT_TINS_PROGRAM_ID,
  decodeTinAccount,
  getTinsGlobalStatePda,
  getTinsIdentityPda,
  getTinsIdentitySeed,
  getTinsRegistryPda,
  resolveTIN,
  type TinResolvedIdentity,
} from "@trustlink/tsn-sdk/tins";

import { signSolanaMessage } from "@/src/lib/wallet";
import { traceFunction } from "../../../utils/observability/tracer";

const DEFAULT_SOLANA_RPC_URL = "https://api.devnet.solana.com";
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

function getFrontendTinsProgramId() {
  return new PublicKey(process.env.NEXT_PUBLIC_TINS_PROGRAM_ID ?? DEFAULT_TINS_PROGRAM_ID);
}

function getFrontendSolanaRpcUrl() {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? DEFAULT_SOLANA_RPC_URL;
}

export type BrowserResolvedTin = {
  tin: string;
  name: string | null;
  authority: string;
  registry: string;
  accountKind: "registry" | "legacy";
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
    connection: new Connection(getFrontendSolanaRpcUrl(), "confirmed"),
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
  const rpcUrl = getFrontendSolanaRpcUrl();
  const connection = new Connection(rpcUrl, "confirmed");
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
