import { Connection, PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
import { sha256 } from "@noble/hashes/sha256";
import nacl from "tweetnacl";
import { decodeTinV1RegistryAccount, validateTinTipRoute } from "./tins.js";
import { decodeTinMasterSeedEnvelope } from "./tin-envelopes.js";
import { withTinOwnerMasterSeed } from "./tin-private-controller.js";
import { loadTinGpruTokenBalancesV1 } from "./gpru/chain-history.js";

/** Accepts both wallet adapters and injected Solana browser wallets. */
export type TinBalanceWallet = {
  publicKey: string | { toBase58(): string };
  signMessage(message: Uint8Array, encoding?: "utf8"): Promise<Uint8Array | { signature: Uint8Array }>;
  on?(event: "disconnect" | "accountChanged", listener: () => void): unknown;
  removeListener?(event: "disconnect" | "accountChanged", listener: () => void): unknown;
};

/** Authenticated transport for the existing owner identity challenge service. */
export type TinOwnerIdentityClient = {
  post(path: string, body: unknown): Promise<unknown>;
};
export type TinOwnerBalanceContextV1 = { registry: string; programId: string };
export type TinOwnerBalanceV1 = Awaited<ReturnType<typeof loadTinGpruTokenBalancesV1>>;
export type LoadTinOwnerBalanceV1Params = {
  connection: Connection;
  tin: string;
  ownerWallet: TinBalanceWallet;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  /** Opt in to device-memory access reuse. Clear on logout with clearTinOwnerBalanceAccessV1. */
  cacheAuthorization?: boolean;
} & (
  | { identityClient: TinOwnerIdentityClient; registry?: never; programId?: never; displayName?: never }
  | { identityClient?: never; registry: string; programId: string; displayName: string }
);

type Access = {
  publicKey: string;
  signatures: Map<string, Uint8Array>;
  contexts: Map<TinOwnerIdentityClient, Map<string, TinOwnerBalanceContextV1 & { displayName: string }>>;
  detach: () => void;
};
const accessByWallet = new WeakMap<TinBalanceWallet, Access>();
const walletKey = (wallet: TinBalanceWallet) => new PublicKey(
  typeof wallet.publicKey === "string" ? wallet.publicKey : wallet.publicKey.toBase58(),
).toBase58();

/** Erases reusable local signatures and invalidates outstanding balance reads. */
export function clearTinOwnerBalanceAccessV1(wallet: TinBalanceWallet): void {
  const access = accessByWallet.get(wallet);
  if (!access) return;
  accessByWallet.delete(wallet);
  for (const signature of access.signatures.values()) signature.fill(0);
  access.signatures.clear();
  access.contexts.clear();
  access.detach();
}

/** Canonical message shared with the owner identity service; no transaction authority. */
export function buildOwnerTinIdentityChallengeMessageV1(params: {
  ownerPublicKey: string; tin: string; challengeId: string;
}): Uint8Array {
  if (!/^\d{10}$/.test(params.tin) || !/^[a-f0-9]{48}$/.test(params.challengeId)) {
    throw new Error("Invalid owner identity challenge.");
  }
  return new TextEncoder().encode([
    "TrustLink", "Private identity display", "", "Purpose", "",
    "Confirm wallet ownership to display the name encrypted with this TIN.", "", "Wallet", "",
    new PublicKey(params.ownerPublicKey).toBase58(), "", "TIN", "", params.tin, "", "One-time request", "",
    params.challengeId, "",
    "This signature authorizes this XP lookup only. It does not authorize a transaction or move funds.",
  ].join("\n"));
}

async function readOwnerBalanceRegistryV1(params: {
  connection: Connection; registry: string; programId: string; ownerPublicKey: string;
}) {
  const registry = new PublicKey(params.registry), programId = new PublicKey(params.programId);
  const accountInfo = await params.connection.getAccountInfo(registry, "finalized");
  if (!accountInfo || !accountInfo.owner.equals(programId)) throw new Error("TIN balance registry is unavailable.");
  const account = decodeTinV1RegistryAccount(accountInfo.data);
  const [expectedRegistry, bump] = PublicKey.findProgramAddressSync([Buffer.from("tin-v1"), account.lookupCommitment], programId);
  const ownerHash = Buffer.from(sha256(new PublicKey(params.ownerPublicKey).toBytes()));
  if (account.version !== 1 || account.status !== 1 || account.bump !== bump || !registry.equals(expectedRegistry)
      || !account.ownerCommitment.equals(ownerHash) || !validateTinTipRoute(account) || !account.encryptedMasterSeed.length) {
    throw new Error("TIN balance registry does not match the connected owner and current GPRU keys.");
  }
  return account;
}

/** Backend owner-context validation using the same registry checks as the complete balance read. */
export async function getTinOwnerBalanceContextV1(params: {
  connection: Connection; registry: string; programId: string; ownerPublicKey: string;
}): Promise<TinOwnerBalanceContextV1> {
  await readOwnerBalanceRegistryV1(params);
  return { registry: new PublicKey(params.registry).toBase58(), programId: new PublicKey(params.programId).toBase58() };
}

/**
 * Complete owner balance read: resolve identity, validate registry and owner,
 * obtain wallet seed authorization, decrypt locally and verify finalized history.
 * RPC and the identity service never receive the seed or reusable seed signature.
 */
export async function loadTinOwnerBalanceV1(params: LoadTinOwnerBalanceV1Params): Promise<TinOwnerBalanceV1> {
  if (!/^\d{10}$/.test(params.tin)) throw new Error("A ten-digit TIN is required.");
  const wallet = params.ownerWallet, publicKey = walletKey(wallet);
  let access = accessByWallet.get(wallet);
  if (access && access.publicKey !== publicKey) {
    clearTinOwnerBalanceAccessV1(wallet);
    access = undefined;
  }
  if (!access) {
    const invalidate = () => clearTinOwnerBalanceAccessV1(wallet);
    access = { publicKey, signatures: new Map(), contexts: new Map(), detach: () => {
      wallet.removeListener?.("disconnect", invalidate);
      wallet.removeListener?.("accountChanged", invalidate);
    } };
    accessByWallet.set(wallet, access);
    wallet.on?.("disconnect", invalidate);
    wallet.on?.("accountChanged", invalidate);
  }
  const currentAccess = access;
  const checkCurrent = () => {
    params.signal?.throwIfAborted();
    if (accessByWallet.get(wallet) !== currentAccess || walletKey(wallet) !== publicKey) {
      throw new Error("Connected wallet changed during balance recovery.");
    }
  };
  const sign = async (message: Uint8Array, reusable: boolean): Promise<Uint8Array> => {
    checkCurrent();
    const key = Buffer.from(message).toString("base64");
    const cached = reusable && params.cacheAuthorization ? currentAccess.signatures.get(key) : undefined;
    if (cached) return new Uint8Array(cached);
    const signed = await wallet.signMessage(message, "utf8");
    const signature = new Uint8Array("signature" in signed ? signed.signature : signed);
    try {
      checkCurrent();
      if (signature.length !== 64 || !nacl.sign.detached.verify(message, signature, new PublicKey(publicKey).toBytes())) {
        throw new Error("Invalid owner wallet signature.");
      }
      if (reusable && params.cacheAuthorization) currentAccess.signatures.set(key, new Uint8Array(signature));
      return new Uint8Array(signature);
    } finally { signature.fill(0); }
  };
  checkCurrent();
  let context: TinOwnerBalanceContextV1 & { displayName: string };
  if (params.identityClient) {
    const client = params.identityClient;
    const cached = params.cacheAuthorization ? currentAccess.contexts.get(client)?.get(params.tin) : undefined;
    if (cached) context = cached;
    else {
      params.onProgress?.("Approve wallet ownership to resolve your TIN balance.");
      const challenge = await client.post("/owner-tin-identity-challenge", { tin: params.tin }) as {
        challengeId?: string; message?: string;
      };
      checkCurrent();
      const message = buildOwnerTinIdentityChallengeMessageV1({ ownerPublicKey: publicKey, tin: params.tin,
        challengeId: challenge?.challengeId ?? "" });
      if (challenge.message !== new TextDecoder().decode(message)) throw new Error("Owner identity challenge binding mismatch.");
      const signature = await sign(message, false);
      let identity;
      try {
        identity = await client.post("/owner-tin-identity", {
          tin: params.tin, challengeId: challenge.challengeId, ownerSignature: Buffer.from(signature).toString("base64"),
          includeBalanceContext: true,
        }) as { tin?: string; displayName?: string; balanceContext?: TinOwnerBalanceContextV1 };
      } finally { signature.fill(0); }
      checkCurrent();
      if (identity?.tin !== params.tin || typeof identity.displayName !== "string"
          || typeof identity.balanceContext?.registry !== "string" || typeof identity.balanceContext.programId !== "string") {
        throw new Error("Owner TIN balance context is unavailable.");
      }
      context = { ...identity.balanceContext, displayName: identity.displayName };
      if (params.cacheAuthorization) {
        if (!currentAccess.contexts.has(client)) currentAccess.contexts.set(client, new Map());
        currentAccess.contexts.get(client)!.set(params.tin, context);
      }
    }
  } else context = { registry: params.registry, programId: params.programId, displayName: params.displayName };
  checkCurrent();
  const account = await readOwnerBalanceRegistryV1({ connection: params.connection,
    registry: context.registry, programId: context.programId, ownerPublicKey: publicKey });
  checkCurrent();
  const envelope = decodeTinMasterSeedEnvelope(account.encryptedMasterSeed);
  if (envelope.provider !== "wallet-owner-signature-v1" || !/^0{64}$/.test(envelope.pruConfigurationHash)) {
    throw new Error("This TIN envelope does not support current wallet-owner GPRU recovery.");
  }
  params.onProgress?.("Approve wallet access to recover your balance locally.");
  let seedSignature: Uint8Array | undefined;
  try {
    const result = await withTinOwnerMasterSeed({ tin: params.tin, displayName: context.displayName,
      pruConfigurationHash: envelope.pruConfigurationHash, envelope,
      ownerWallet: { publicKey, signMessage: async message => (seedSignature = await sign(message, true)) },
    }, masterSeed => {
      checkCurrent();
      return loadTinGpruTokenBalancesV1({ connection: params.connection, masterSeed,
        gpruElgamalPublicKey: account.gpruElgamalPublicKey, gpruBalanceScanPublicKeyX: account.gpruBalanceScanPublicKeyX,
        gpruBalanceScanPublicKeyY: account.gpruBalanceScanPublicKeyY, signal: params.signal,
        onProgress: message => { checkCurrent(); params.onProgress?.(message); },
      });
    });
    checkCurrent();
    return result;
  } finally { seedSignature?.fill(0); }
}
