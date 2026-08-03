import nacl from "tweetnacl";
import { PublicKey, type Connection } from "@solana/web3.js";

import {
  computePruConfigurationHash,
  derivePruSet,
  generateTinMasterSeed,
} from "./pru.js";
import {
  createTinMasterSeedEnvelope,
  createTinPublicRoutePayload,
  encodeTinEnvelope,
  encryptTinPublicRoutePayload,
  serializeTinMasterSeedWalletAuthorization,
  validateTinMasterSeedEnvelope,
  type TinMasterSeedEnvelope,
  type TinPublicRouteEntry,
} from "./tin-envelopes.js";
import {
  createTinDeviceAccessProof,
  type TinAuthorizedDeviceSigner,
  type TinDeviceAccessProof,
} from "./tin-device-access.js";
import type { TinDeviceKeyEnvelope } from "./tin-device-key-envelope.js";
import {
  decryptTinMasterSeedLocally,
  encryptTinMasterSeedLocally,
} from "./tin-local-master-seed.js";
import { sha256Hex } from "./receipts/internal/encoding.js";

export type TinOwnerWallet = {
  publicKey: string;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
};

export type TinMasterSeedAccessContext = {
  tin: string;
  ownerPublicKey: string;
  routeVersion: number;
  pruConfigurationHash: string;
  deviceSessionBinding: string;
  walletAuthorizationMessage: Uint8Array;
  walletAuthorizationSignature: Uint8Array;
  deviceAccessProof: TinDeviceAccessProof;
  resourceCommitment: string;
};

/**
 * The provider protects only a random data-encryption key. The master seed is
 * encrypted and decrypted locally by this controller and is never an input to
 * a threshold provider, Lit Action, TSN Node, backend, or Cranker.
 */
export interface TinMasterSeedThresholdProvider {
  readonly id: string;
  getDeviceSessionBinding(): Promise<string>;
  protectKey(params: TinMasterSeedAccessContext): Promise<{
    protectedKey: string;
    protectedKeyCommitment: string;
    accessControlHash: string;
    deviceKeyEnvelope: TinDeviceKeyEnvelope;
  }>;
  releaseKey(params: TinMasterSeedAccessContext & {
    protectedKey: string;
    protectedKeyCommitment: string;
    accessControlHash: string;
  }): Promise<TinDeviceKeyEnvelope>;
}

let configuredThresholdProvider: TinMasterSeedThresholdProvider | null = null;

export function configureTinMasterSeedThresholdProvider(
  provider: TinMasterSeedThresholdProvider | null,
) {
  configuredThresholdProvider = provider;
}

export function getTinMasterSeedThresholdProvider() {
  if (!configuredThresholdProvider) {
    throw new Error(
      "Authorized-device threshold encryption is not configured. TIN private data remains locked.",
    );
  }
  return configuredThresholdProvider;
}

function assertWalletAuthorization(
  wallet: TinOwnerWallet,
  message: Uint8Array,
  signature: Uint8Array,
) {
  const owner = new PublicKey(wallet.publicKey);
  if (
    signature.length !== nacl.sign.signatureLength ||
    !nacl.sign.detached.verify(message, signature, owner.toBytes())
  ) {
    throw new Error("Main-wallet authorization is invalid");
  }
}

async function authorize(
  wallet: TinOwnerWallet,
  thresholdProvider: TinMasterSeedThresholdProvider,
  identity: {
    tin: string;
    routeVersion: number;
    pruConfigurationHash: string;
    resourceCommitment: string;
  },
  device: TinAuthorizedDeviceSigner,
) {
  const thresholdSessionBinding = await thresholdProvider.getDeviceSessionBinding();
  if (!thresholdSessionBinding) throw new Error("Authorized-device session binding is unavailable");
  const deviceSessionBinding =
    `${thresholdSessionBinding}:device:${device.signingKeyFingerprint}` +
    `:encryption:${device.encryptionKeyFingerprint}`;
  const message = serializeTinMasterSeedWalletAuthorization({
    ...identity,
    ownerPublicKey: wallet.publicKey,
    deviceSessionBinding,
  });
  const signature = await wallet.signMessage(message);
  assertWalletAuthorization(wallet, message, signature);
  return { message, signature, deviceSessionBinding };
}

export async function createTinPrivateIdentity(params: {
  tin: string;
  routeVersion: number;
  routeNonce: string;
  ownerWallet: TinOwnerWallet;
  authorizedDevice: TinAuthorizedDeviceSigner;
  thresholdProvider: TinMasterSeedThresholdProvider;
  nodeRoutingPublicKeyBase64: string;
}) {
  const masterSeed = generateTinMasterSeed();
  let dataKey: Uint8Array | null = null;
  try {
    const prus = derivePruSet({
      masterSeed,
      tinId: params.tin,
      initialState: "ACTIVE",
    });
    const pruConfigurationHash = computePruConfigurationHash(prus);
    const resourceCommitment = await sha256Hex(
      crypto.getRandomValues(new Uint8Array(32)),
    );
    const authorization = await authorize(params.ownerWallet, params.thresholdProvider, {
      tin: params.tin,
      routeVersion: params.routeVersion,
      pruConfigurationHash,
      resourceCommitment,
    }, params.authorizedDevice);
    const deviceAccessProof = await createTinDeviceAccessProof({
      operation: "PROTECT_KEY",
      tin: params.tin,
      ownerPublicKey: params.ownerWallet.publicKey,
      routeVersion: params.routeVersion,
      pruConfigurationHash,
      deviceSessionBinding: authorization.deviceSessionBinding,
      walletAuthorizationMessage: authorization.message,
      resourceCommitment,
      device: params.authorizedDevice,
    });
    const protectedDataKey = await params.thresholdProvider.protectKey({
      tin: params.tin,
      ownerPublicKey: params.ownerWallet.publicKey,
      routeVersion: params.routeVersion,
      pruConfigurationHash,
      deviceSessionBinding: authorization.deviceSessionBinding,
      walletAuthorizationMessage: authorization.message,
      walletAuthorizationSignature: authorization.signature,
      deviceAccessProof,
      resourceCommitment,
    });
    dataKey = await params.authorizedDevice.unwrapThresholdKey(
      protectedDataKey.deviceKeyEnvelope,
      deviceAccessProof,
    );
    const localSeed = await encryptTinMasterSeedLocally({
      masterSeed,
      dataKey,
      context: {
        tin: params.tin,
        ownerPublicKey: params.ownerWallet.publicKey,
        routeVersion: params.routeVersion,
        pruConfigurationHash,
      },
    });
    const masterSeedEnvelope = await createTinMasterSeedEnvelope({
      provider: params.thresholdProvider.id,
      tin: params.tin,
      ownerPublicKey: params.ownerWallet.publicKey,
      routeVersion: params.routeVersion,
      pruConfigurationHash,
      resourceCommitment,
      ...localSeed,
      protectedKey: protectedDataKey.protectedKey,
      protectedKeyCommitment: protectedDataKey.protectedKeyCommitment,
      accessControlHash: protectedDataKey.accessControlHash,
    });
    const publicRouteEnvelope = encryptTinPublicRoutePayload({
      payload: createTinPublicRoutePayload({
        tin: params.tin,
        routeVersion: params.routeVersion,
        routeNonce: params.routeNonce,
        pruConfigurationHash,
        prus,
      }),
      nodeRoutingPublicKeyBase64: params.nodeRoutingPublicKeyBase64,
    });
    return {
      pruConfigurationHash,
      encryptedMasterSeed: encodeTinEnvelope(masterSeedEnvelope),
      encryptedPublicRouteEnvelope: encodeTinEnvelope(publicRouteEnvelope),
      publicRoute: createTinPublicRoutePayload({
        tin: params.tin,
        routeVersion: params.routeVersion,
        routeNonce: params.routeNonce,
        pruConfigurationHash,
        prus,
      }),
    };
  } finally {
    dataKey?.fill(0);
    masterSeed.fill(0);
  }
}

export async function unlockTinPrivateRoute(params: {
  tin: string;
  pruConfigurationHash: string;
  envelope: TinMasterSeedEnvelope | Uint8Array;
  ownerWallet: TinOwnerWallet;
  authorizedDevice: TinAuthorizedDeviceSigner;
  thresholdProvider: TinMasterSeedThresholdProvider;
}): Promise<{ prus: TinPublicRouteEntry[] }> {
  const envelope = await validateTinMasterSeedEnvelope({
    envelope: params.envelope,
    tin: params.tin,
    ownerPublicKey: params.ownerWallet.publicKey,
    pruConfigurationHash: params.pruConfigurationHash,
  });
  if (envelope.provider !== params.thresholdProvider.id) {
    throw new Error(`TIN master seed requires the ${envelope.provider} threshold provider`);
  }
  const authorization = await authorize(params.ownerWallet, params.thresholdProvider, {
    tin: params.tin,
    routeVersion: envelope.routeVersion,
    pruConfigurationHash: envelope.pruConfigurationHash,
    resourceCommitment: envelope.resourceCommitment,
  }, params.authorizedDevice);
  const deviceAccessProof = await createTinDeviceAccessProof({
    operation: "RELEASE_KEY",
    tin: params.tin,
    ownerPublicKey: params.ownerWallet.publicKey,
    routeVersion: envelope.routeVersion,
    pruConfigurationHash: envelope.pruConfigurationHash,
    deviceSessionBinding: authorization.deviceSessionBinding,
    walletAuthorizationMessage: authorization.message,
    resourceCommitment: envelope.resourceCommitment,
    device: params.authorizedDevice,
  });
  const deviceKeyEnvelope = await params.thresholdProvider.releaseKey({
    tin: envelope.tin,
    ownerPublicKey: envelope.ownerPublicKey,
    routeVersion: envelope.routeVersion,
    pruConfigurationHash: envelope.pruConfigurationHash,
    deviceSessionBinding: authorization.deviceSessionBinding,
    walletAuthorizationMessage: authorization.message,
    walletAuthorizationSignature: authorization.signature,
    deviceAccessProof,
    resourceCommitment: envelope.resourceCommitment,
    protectedKey: envelope.protectedKey,
    protectedKeyCommitment: envelope.protectedKeyCommitment,
    accessControlHash: envelope.accessControlHash,
  });
  const dataKey = await params.authorizedDevice.unwrapThresholdKey(
    deviceKeyEnvelope,
    deviceAccessProof,
  );
  let masterSeed: Uint8Array | null = null;
  try {
    masterSeed = await decryptTinMasterSeedLocally({
      seedCiphertext: envelope.seedCiphertext,
      seedNonce: envelope.seedNonce,
      expectedSeedCiphertextCommitment: envelope.seedCiphertextCommitment,
      dataKey,
      context: {
        tin: envelope.tin,
        ownerPublicKey: envelope.ownerPublicKey,
        routeVersion: envelope.routeVersion,
        pruConfigurationHash: envelope.pruConfigurationHash,
      },
    });
    const prus = derivePruSet({
      masterSeed,
      tinId: params.tin,
      initialState: "ACTIVE",
    });
    const commitment = computePruConfigurationHash(prus);
    if (commitment.toLowerCase() !== params.pruConfigurationHash.toLowerCase()) {
      throw new Error("Locally derived PRUs do not match the TIN PRU configuration commitment");
    }
    return {
      prus: createTinPublicRoutePayload({
        tin: params.tin,
        routeVersion: envelope.routeVersion,
        routeNonce: "0".repeat(64),
        pruConfigurationHash: commitment,
        prus,
      }).prus,
    };
  } finally {
    masterSeed?.fill(0);
    dataKey.fill(0);
  }
}

export type TinBalanceTokenInput = {
  mint: string;
  decimals: number;
};

export async function loadTinPrivateTokenBalances(params: {
  tin: string;
  pruConfigurationHash: string;
  envelope: TinMasterSeedEnvelope | Uint8Array;
  ownerWallet: TinOwnerWallet;
  authorizedDevice: TinAuthorizedDeviceSigner;
  thresholdProvider: TinMasterSeedThresholdProvider;
  connection: Connection;
  tokens: TinBalanceTokenInput[];
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}) {
  params.onProgress?.("Unlocking the TIN route on this authorized device...");
  const route = await unlockTinPrivateRoute(params);
  const activePrus = route.prus.filter((pru) => pru.state !== "SWEPT");
  params.onProgress?.(`Found ${activePrus.length} active PRUs. Loading balances...`);
  const nonZeroPruIndexes = new Set<number>();
  const pruBalances: Array<{
    pruIndex: number;
    publicKey: string;
    mint: string;
    balanceBaseUnits: string;
  }> = [];
  const tokenBalances: Array<{
    mint: string;
    decimals: number;
    balanceBaseUnits: string;
  }> = [];

  for (const token of params.tokens) {
    let tokenTotal = 0n;
    for (const pru of activePrus) {
      if (params.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const accounts = await params.connection.getParsedTokenAccountsByOwner(
        new PublicKey(pru.publicKey),
        { mint: new PublicKey(token.mint) },
        "confirmed",
      );
      const balance = accounts.value.reduce((sum, account) => {
        const parsed = account.account.data as {
          parsed: { info: { tokenAmount: { amount: string } } };
        };
        return sum + BigInt(parsed.parsed.info.tokenAmount.amount);
      }, 0n);
      if (balance > 0n) {
        nonZeroPruIndexes.add(pru.index);
        pruBalances.push({
          pruIndex: pru.index,
          publicKey: pru.publicKey,
          mint: token.mint,
          balanceBaseUnits: balance.toString(),
        });
      }
      tokenTotal += balance;
    }
    tokenBalances.push({
      ...token,
      balanceBaseUnits: tokenTotal.toString(),
    });
  }

  return {
    tokenBalances,
    pruBalances,
    pruCount: route.prus.length,
    activePruCount: activePrus.length,
    nonZeroPruCount: nonZeroPruIndexes.size,
  };
}
