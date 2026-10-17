import nacl from "tweetnacl";
import { PublicKey, type Connection } from "@solana/web3.js";
import { deriveTinPrivacyReceivingKeyPair } from "./gpru.js";

import {
  computePruConfigurationHash,
  derivePruSet,
  generateTinMasterSeed,
} from "./pru.js";
import {
  createTinMasterSeedEnvelope,
  createTinPublicRoutePayload,
  decodeTinMasterSeedEnvelope,
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
import { sha256Hex, toArrayBuffer } from "./receipts/internal/encoding.js";

const WALLET_OWNER_ENVELOPE_PROVIDER = "wallet-owner-signature-v1";
const WALLET_OWNER_SESSION_BINDING = "wallet-owner-any-device-v1";
const LEGACY_PROGRAM_ASSIGNED_TIN_MARKER = "program-assigned";

export type TinOwnerWallet = {
  publicKey: string;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
};

export function buildTinV1OwnerEncryptionMessage(params: {
  ownerPublicKey: string;
  displayName: string;
} & ({ resourceCommitment: string; nonce?: never } | { nonce: Uint8Array; resourceCommitment?: never })) {
  const displayName = params.displayName.trim();
  if (!displayName || displayName.length > 100 || /[\r\n\u0000-\u001f\u007f]/u.test(displayName)) {
    throw new Error("displayName must be a single printable line of at most 100 characters");
  }
  const reference = params.resourceCommitment
    ? `Encryption resource commitment: ${params.resourceCommitment.toLowerCase()}`
    : `Request reference: ${Buffer.from(params.nonce!).toString("hex")}`;
  if (params.resourceCommitment && !/^[0-9a-f]{64}$/i.test(params.resourceCommitment)) {
    throw new Error("resourceCommitment must be 32-byte hex");
  }
  return new TextEncoder().encode(
    [
      "TrustLink private TIN creation",
      "",
      "Action",
      "Create a new private TIN.",
      "",
      "Owner wallet",
      params.ownerPublicKey,
      "",
      "Display name",
      displayName,
      "",
      reference,
      "",
      "The TIN identity record is submitted in encrypted form. The owner seed is encrypted on this device.",
      "",
      "This signature confirms that you control this wallet and approve this display name for TIN creation. It does not authorize a token transfer.",
    ].join("\n"),
  );
}

/** Stable, reproducible wallet approval used to encrypt a TIN seed for later recovery. */
export async function prepareTinV1OwnerSeedAccess(params: {
  ownerPublicKey: string;
  displayName: string;
  nonce: Uint8Array;
}) {
  if (params.nonce.length !== 32) throw new Error("nonce must be 32 bytes");
  const resourceCommitment = await sha256Hex(new TextEncoder().encode(
    `TSN_TIN_MASTER_SEED_RESOURCE_V1\n${Buffer.from(params.nonce).toString("hex")}`,
  ));
  const message = new TextDecoder().decode(buildTinV1OwnerEncryptionMessage({
    ownerPublicKey: new PublicKey(params.ownerPublicKey).toBase58(),
    displayName: params.displayName,
    resourceCommitment,
  }));
  return { resourceCommitment, message };
}

/**
 * Creates the owner-recoverable seed envelope for a new TIN V1 intent.
 * The seed and signature-derived key stay in this runtime; only the encrypted
 * envelope is returned for inclusion in the owner-authorized creation intent.
 */
export async function createTinV1OwnerSeedEnvelope(params: {
  ownerWallet: TinOwnerWallet;
  displayName: string;
  nonce: Uint8Array;
}) {
  const access = await prepareTinV1OwnerSeedAccess({
    ownerPublicKey: params.ownerWallet.publicKey,
    displayName: params.displayName,
    nonce: params.nonce,
  });
  const message = new TextEncoder().encode(access.message);
  const signature = await params.ownerWallet.signMessage(message);
  assertWalletAuthorization(params.ownerWallet, message, signature);
  const dataKey = await walletOwnerDataKey(signature);
  const masterSeed = generateTinMasterSeed();
  const marker = "tin-v1";
  const pruConfigurationHash = "0".repeat(64);
  const tinPrivacyReceivingKeyPair = deriveTinPrivacyReceivingKeyPair(masterSeed);
  try {
    const localSeed = await encryptTinMasterSeedLocally({
      masterSeed,
      dataKey,
      context: {
        tin: marker,
        ownerPublicKey: params.ownerWallet.publicKey,
        routeVersion: 1,
        pruConfigurationHash,
      },
    });
    const envelope = await createTinMasterSeedEnvelope({
      provider: WALLET_OWNER_ENVELOPE_PROVIDER,
      tin: marker,
      ownerPublicKey: params.ownerWallet.publicKey,
      routeVersion: 1,
      pruConfigurationHash,
      resourceCommitment: access.resourceCommitment,
      ...localSeed,
      protectedKey: "wallet-owner-signature-derived",
      protectedKeyCommitment: await sha256Hex(
        new TextEncoder().encode("wallet-owner-signature-derived"),
      ),
      accessControlHash: await sha256Hex(message),
    });
    return {
      resourceCommitment: access.resourceCommitment,
      encryptedMasterSeed: encodeTinEnvelope(envelope),
      gpruPublicCommitment: new Uint8Array(tinPrivacyReceivingKeyPair.publicKey),
    };
  } finally {
    dataKey.fill(0);
    masterSeed.fill(0);
    tinPrivacyReceivingKeyPair.secretKey.fill(0);
  }
}

function buildOwnerSeedAccessMessage(
  envelope: TinMasterSeedEnvelope,
  ownerPublicKey: string,
  displayName: string,
): Uint8Array {
  return buildTinV1OwnerEncryptionMessage({
    ownerPublicKey: new PublicKey(ownerPublicKey).toBase58(),
    displayName,
    resourceCommitment: envelope.resourceCommitment,
  });
}

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
  releaseKey(
    params: TinMasterSeedAccessContext & {
      protectedKey: string;
      protectedKeyCommitment: string;
      accessControlHash: string;
    },
  ): Promise<TinDeviceKeyEnvelope>;
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
  const thresholdSessionBinding =
    await thresholdProvider.getDeviceSessionBinding();
  if (!thresholdSessionBinding)
    throw new Error("Authorized-device session binding is unavailable");
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

async function authorizeWalletOwner(
  wallet: TinOwnerWallet,
  identity: {
    tin: string;
    routeVersion: number;
    pruConfigurationHash: string;
    resourceCommitment: string;
  },
) {
  const message = serializeTinMasterSeedWalletAuthorization({
    ...identity,
    ownerPublicKey: wallet.publicKey,
    // This is deliberately constant. The wallet signature, not a browser
    // device credential, is the authorization for an owner-controlled TIN.
    deviceSessionBinding: WALLET_OWNER_SESSION_BINDING,
  });
  const signature = await wallet.signMessage(message);
  assertWalletAuthorization(wallet, message, signature);
  return { message, signature };
}

async function walletOwnerDataKey(signature: Uint8Array) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", toArrayBuffer(signature)),
  );
}

export async function createTinPrivateIdentity(params: {
  tin: string;
  routeVersion: number;
  routeNonce: string;
  ownerWallet: TinOwnerWallet;
  nodeRoutingPublicKeyBase64: string;
  /** Internal migration input. The value is copied and cleared before return. */
  masterSeed?: Uint8Array;
}) {
  const masterSeed = params.masterSeed
    ? new Uint8Array(params.masterSeed)
    : generateTinMasterSeed();
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
    const authorization = await authorizeWalletOwner(params.ownerWallet, {
      tin: params.tin,
      routeVersion: params.routeVersion,
      pruConfigurationHash,
      resourceCommitment,
    });
    dataKey = await walletOwnerDataKey(authorization.signature);
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
      provider: WALLET_OWNER_ENVELOPE_PROVIDER,
      tin: params.tin,
      ownerPublicKey: params.ownerWallet.publicKey,
      routeVersion: params.routeVersion,
      pruConfigurationHash,
      resourceCommitment,
      ...localSeed,
      protectedKey: "wallet-owner-signature-derived",
      protectedKeyCommitment: await sha256Hex(
        new TextEncoder().encode("wallet-owner-signature-derived"),
      ),
      accessControlHash: await sha256Hex(authorization.message),
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

/**
 * Re-encrypt an existing TIN seed for wallet-owned, any-device access without
 * changing its derived PRUs. A legacy device is used only once to open its old
 * envelope; it is never made part of the new envelope.
 */
export async function rewrapTinPrivateIdentityForWalletOwner(params: {
  tin: string;
  pruConfigurationHash: string;
  envelope: TinMasterSeedEnvelope | Uint8Array;
  ownerWallet: TinOwnerWallet;
  routeVersion: number;
  routeNonce: string;
  nodeRoutingPublicKeyBase64: string;
  authorizedDevice?: TinAuthorizedDeviceSigner;
  thresholdProvider?: TinMasterSeedThresholdProvider;
}) {
  const envelope = await validateTinMasterSeedEnvelope({
    envelope: params.envelope,
    tin: params.tin,
    ownerPublicKey: params.ownerWallet.publicKey,
    pruConfigurationHash: params.pruConfigurationHash,
  });
  let dataKey: Uint8Array;
  if (envelope.provider === WALLET_OWNER_ENVELOPE_PROVIDER) {
    const authorization = await authorizeWalletOwner(params.ownerWallet, {
      tin: params.tin,
      routeVersion: envelope.routeVersion,
      pruConfigurationHash: envelope.pruConfigurationHash,
      resourceCommitment: envelope.resourceCommitment,
    });
    dataKey = await walletOwnerDataKey(authorization.signature);
  } else {
    if (!params.thresholdProvider || !params.authorizedDevice) {
      throw new Error(
        "This legacy TIN needs its existing device for a one-time any-device upgrade",
      );
    }
    if (envelope.provider !== params.thresholdProvider.id) {
      throw new Error(
        `TIN master seed requires the ${envelope.provider} provider`,
      );
    }
    const authorization = await authorize(
      params.ownerWallet,
      params.thresholdProvider,
      {
        tin: params.tin,
        routeVersion: envelope.routeVersion,
        pruConfigurationHash: envelope.pruConfigurationHash,
        resourceCommitment: envelope.resourceCommitment,
      },
      params.authorizedDevice,
    );
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
      ownerPublicKey: params.ownerWallet.publicKey,
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
    dataKey = await params.authorizedDevice.unwrapThresholdKey(
      deviceKeyEnvelope,
      deviceAccessProof,
    );
  }
  let masterSeed: Uint8Array | null = null;
  try {
    masterSeed = await decryptTinMasterSeedLocally({
      seedCiphertext: envelope.seedCiphertext,
      seedNonce: envelope.seedNonce,
      expectedSeedCiphertextCommitment: envelope.seedCiphertextCommitment,
      dataKey,
      context: {
        tin: envelope.tin,
        ownerPublicKey: params.ownerWallet.publicKey,
        routeVersion: envelope.routeVersion,
        pruConfigurationHash: envelope.pruConfigurationHash,
      },
    });
    const commitment = computePruConfigurationHash(
      derivePruSet({
        masterSeed,
        tinId: params.tin,
        initialState: "ACTIVE",
      }),
    );
    if (
      commitment.toLowerCase() !== params.pruConfigurationHash.toLowerCase()
    ) {
      throw new Error(
        "The existing TIN seed does not match its registered PRU route",
      );
    }
    return await createTinPrivateIdentity({
      tin: params.tin,
      routeVersion: params.routeVersion,
      routeNonce: params.routeNonce,
      ownerWallet: params.ownerWallet,
      nodeRoutingPublicKeyBase64: params.nodeRoutingPublicKeyBase64,
      masterSeed,
    });
  } finally {
    masterSeed?.fill(0);
    dataKey.fill(0);
  }
}

export async function unlockTinPrivateRoute(params: {
  tin: string;
  pruConfigurationHash: string;
  envelope: TinMasterSeedEnvelope | Uint8Array;
  ownerWallet: TinOwnerWallet;
  authorizedDevice?: TinAuthorizedDeviceSigner;
  thresholdProvider?: TinMasterSeedThresholdProvider;
}): Promise<{ prus: TinPublicRouteEntry[] }> {
  const envelope = await validateTinMasterSeedEnvelope({
    envelope: params.envelope,
    tin: params.tin,
    ownerPublicKey: params.ownerWallet.publicKey,
    pruConfigurationHash: params.pruConfigurationHash,
  });
  let dataKey: Uint8Array;
  if (envelope.provider === WALLET_OWNER_ENVELOPE_PROVIDER) {
    const authorization = await authorizeWalletOwner(params.ownerWallet, {
      tin: params.tin,
      routeVersion: envelope.routeVersion,
      pruConfigurationHash: envelope.pruConfigurationHash,
      resourceCommitment: envelope.resourceCommitment,
    });
    dataKey = await walletOwnerDataKey(authorization.signature);
  } else {
    if (!params.thresholdProvider || !params.authorizedDevice) {
      throw new Error(
        "This legacy TIN needs a one-time wallet-authorized migration before it can be opened on any device",
      );
    }
    if (envelope.provider !== params.thresholdProvider.id) {
      throw new Error(
        `TIN master seed requires the ${envelope.provider} provider`,
      );
    }
    const authorization = await authorize(
      params.ownerWallet,
      params.thresholdProvider,
      {
        tin: params.tin,
        routeVersion: envelope.routeVersion,
        pruConfigurationHash: envelope.pruConfigurationHash,
        resourceCommitment: envelope.resourceCommitment,
      },
      params.authorizedDevice,
    );
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
      ownerPublicKey: params.ownerWallet.publicKey,
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
    dataKey = await params.authorizedDevice.unwrapThresholdKey(
      deviceKeyEnvelope,
      deviceAccessProof,
    );
  }
  let masterSeed: Uint8Array | null = null;
  try {
    masterSeed = await decryptTinMasterSeedLocally({
      seedCiphertext: envelope.seedCiphertext,
      seedNonce: envelope.seedNonce,
      expectedSeedCiphertextCommitment: envelope.seedCiphertextCommitment,
      dataKey,
      context: {
        tin: envelope.tin,
        ownerPublicKey: params.ownerWallet.publicKey,
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
    if (
      commitment.toLowerCase() !== params.pruConfigurationHash.toLowerCase()
    ) {
      throw new Error(
        "Locally derived PRUs do not match the TIN PRU configuration commitment",
      );
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

/**
 * Run an owner-only operation with the TIN master seed in memory. The SDK asks
 * the connected wallet to authorize access, verifies the envelope bindings,
 * and clears both the derived key and seed when the callback completes.
 * Callers should use this instead of exporting or persisting the seed.
 */
export async function withTinOwnerMasterSeed<T>(params: {
  tin: string;
  displayName: string;
  pruConfigurationHash: string;
  envelope: TinMasterSeedEnvelope | Uint8Array;
  ownerWallet: TinOwnerWallet;
}, use: (masterSeed: Uint8Array) => Promise<T>): Promise<T> {
  const candidate = params.envelope instanceof Uint8Array
    ? decodeTinMasterSeedEnvelope(params.envelope)
    : params.envelope;
  // Current TIN V1 XP accounts were issued before the generated TIN was known
  // to the browser. Their owner-encrypted seed is bound to the explicit
  // `tin-v1` marker and wallet; the on-chain owner hash binds it to the TIN.
  if (candidate.tin !== params.tin && candidate.tin !== "tin-v1" && candidate.tin !== LEGACY_PROGRAM_ASSIGNED_TIN_MARKER) {
    throw new Error("TIN_MASTER_SEED_ENVELOPE_IDENTITY_MISMATCH");
  }
  const envelope = await validateTinMasterSeedEnvelope({
    envelope: candidate,
    tin: candidate.tin,
    ownerPublicKey: params.ownerWallet.publicKey,
    pruConfigurationHash: candidate.pruConfigurationHash,
  });
  if (envelope.provider !== WALLET_OWNER_ENVELOPE_PROVIDER) {
    throw new Error("TIN_MASTER_SEED_PROVIDER_REQUIRES_MIGRATION");
  }
  let accessMessage: Uint8Array;
  if (envelope.tin === "tin-v1") {
    accessMessage = buildOwnerSeedAccessMessage(
      envelope,
      params.ownerWallet.publicKey,
      params.displayName,
    );
    const expectedAccessHash = await sha256Hex(accessMessage);
    if (expectedAccessHash !== envelope.accessControlHash.toLowerCase()) {
      throw new Error("TIN_MASTER_SEED_REAUTHORIZATION_REQUIRED");
    }
  } else {
    accessMessage = serializeTinMasterSeedWalletAuthorization({
      tin: envelope.tin,
      ownerPublicKey: params.ownerWallet.publicKey,
      routeVersion: envelope.routeVersion,
      pruConfigurationHash: envelope.pruConfigurationHash,
      resourceCommitment: envelope.resourceCommitment,
      deviceSessionBinding: WALLET_OWNER_SESSION_BINDING,
    });
    if ((await sha256Hex(accessMessage)) !== envelope.accessControlHash.toLowerCase()) {
      throw new Error("TIN_MASTER_SEED_REAUTHORIZATION_REQUIRED");
    }
  }
  const signature = await params.ownerWallet.signMessage(accessMessage);
  assertWalletAuthorization(params.ownerWallet, accessMessage, signature);
  const dataKey = await walletOwnerDataKey(signature);
  let masterSeed: Uint8Array | null = null;
  try {
    masterSeed = await decryptTinMasterSeedLocally({
      seedCiphertext: envelope.seedCiphertext,
      seedNonce: envelope.seedNonce,
      expectedSeedCiphertextCommitment: envelope.seedCiphertextCommitment,
      dataKey,
      context: {
        tin: envelope.tin,
        ownerPublicKey: params.ownerWallet.publicKey,
        routeVersion: envelope.routeVersion,
        pruConfigurationHash: envelope.pruConfigurationHash,
      },
    });
    if (!/^0{64}$/i.test(params.pruConfigurationHash)) {
      const expectedRoute = computePruConfigurationHash(derivePruSet({
        masterSeed,
        tinId: params.tin,
        initialState: "ACTIVE",
      }));
      if (expectedRoute.toLowerCase() !== params.pruConfigurationHash.toLowerCase()) {
        throw new Error("TIN_MASTER_SEED_ROUTE_COMMITMENT_MISMATCH");
      }
    }
    return await use(masterSeed);
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
  authorizedDevice?: TinAuthorizedDeviceSigner;
  thresholdProvider?: TinMasterSeedThresholdProvider;
  connection: Connection;
  tokens: TinBalanceTokenInput[];
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}) {
  params.onProgress?.(
    "Unlocking the TIP route associated with this TIN using your wallet authorization...",
  );
  const route = await unlockTinPrivateRoute(params);
  const activePrus = route.prus.filter((pru) => pru.state !== "SWEPT");
  params.onProgress?.(
    `Found ${activePrus.length} active PRUs. Loading balances...`,
  );
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
      if (params.signal?.aborted)
        throw new DOMException("Aborted", "AbortError");
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
