"use client";

import { PublicKey } from "@solana/web3.js";
import { decodeTinAccount } from "@trustlink/tsn-sdk/tins";
import {
  loadTinPrivateTokenBalances,
} from "@trustlink/tsn-sdk/tin-private-controller";

import { createSolanaConnection } from "@/src/lib/rpc";
import { resolveTinFromChain } from "@/src/lib/tins";
import type { WalletTokenOption } from "@/src/lib/types";
import type { ConnectedWalletSession } from "@/src/lib/wallet";
import { signTinMasterSeedAuthorizationBytes } from "@/src/lib/wallet";
import { getBrowserTinAuthorizedDeviceAccess } from "@/src/lib/tin-authorized-device-access";
import { getTinAuthorizedDeviceSigner } from "@/src/lib/tsn-device-authorization";
import {
  cacheTinBalanceAuthorization,
  getCachedTinBalanceAuthorization,
} from "@/src/lib/tin-balance-session";

export type TinTokenBalanceResult = {
  tokens: WalletTokenOption[];
  pruBalances: Array<{
    pruIndex: number;
    publicKey: string;
    tokenMintAddress: string;
    balance: number;
    balanceBaseUnits: string;
  }>;
  pruCount: number;
  activePruCount: number;
  nonZeroPruCount: number;
};

function describeTinBalanceError(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Unexpected error while opening the authorized TIN balance";
}

function bytesToBase64(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

const walletAuthorizationInFlight = new Map<string, Promise<Uint8Array>>();

export async function loadTinTokenBalances(params: {
  tin: string;
  walletSession: ConnectedWalletSession;
  supportedTokens: WalletTokenOption[];
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}): Promise<TinTokenBalanceResult> {
  // Obtain the authorized-device adapter before querying the chain. This
  // avoids displaying a misleading zero balance when the device is not
  // authorized for the selected TIN.
  let accessProvider: Awaited<ReturnType<typeof getBrowserTinAuthorizedDeviceAccess>>;
  try {
    accessProvider = await getBrowserTinAuthorizedDeviceAccess();
  } catch (error) {
    throw new Error(`TIN authorized-device access failed: ${describeTinBalanceError(error)}`);
  }
  params.onProgress?.("Decrypting the TIN route on this authorized device...");
  let identity: Awaited<ReturnType<typeof resolveTinFromChain>>;
  try {
    identity = await resolveTinFromChain(params.tin);
  } catch (error) {
    throw new Error(`TIN account lookup failed: ${describeTinBalanceError(error)}`);
  }
  if (identity.upgradeRequired) {
    throw new Error(
      identity.upgradeReason ??
        "This TIN must be upgraded before private balances can be loaded.",
    );
  }
  const connection = createSolanaConnection({ frontendSafe: true });
  const account = await connection.getAccountInfo(new PublicKey(identity.registry), "confirmed");
  if (!account) throw new Error("The selected TIN account is unavailable on Devnet.");
  const decoded = decodeTinAccount(account.data);
  // A TIN can retain its original TIP account layout while carrying the
  // complete TSN envelopes. Do not use `accountKind === legacy` (or a stale
  // resolver flag) as a privacy capability gate; inspect the actual envelope
  // fields on the account instead.
  const hasCurrentTsnEnvelopes =
    decoded.encryptedMasterSeed.length > 0 &&
    decoded.pruConfigurationHash?.length === 32 &&
    Boolean(decoded.encryptedPublicRouteEnvelope?.length) &&
    Boolean(decoded.routeVersion && decoded.routeVersion > 0n) &&
    decoded.routeNonce?.length === 32;
  if (!hasCurrentTsnEnvelopes) {
    params.onProgress?.("Legacy TIN detected; private ZK-PRU balances require a TIN upgrade.");
    return {
      tokens: params.supportedTokens.map((token) => ({ ...token, balance: 0, balanceUsd: null })),
      pruBalances: [],
      pruCount: 0,
      activePruCount: 0,
      nonZeroPruCount: 0,
    };
  }
  if (!decoded.pruConfigurationHash || !decoded.encryptedMasterSeed.length) {
    throw new Error("This legacy TIN must be upgraded before private balances can be loaded.");
  }
  const pruConfigurationHash = Buffer.from(decoded.pruConfigurationHash).toString("hex");
  let balances: Awaited<ReturnType<typeof loadTinPrivateTokenBalances>>;
  try {
    balances = await loadTinPrivateTokenBalances({
      tin: params.tin,
      pruConfigurationHash,
      envelope: decoded.encryptedMasterSeed,
      ownerWallet: {
        publicKey: params.walletSession.address,
        signMessage: async (message) => {
          const cacheKey = `${params.tin}:${params.walletSession.address}:${bytesToBase64(message)}`;
          const cached = getCachedTinBalanceAuthorization(cacheKey);
          if (cached) return base64ToBytes(cached);
          const pending = walletAuthorizationInFlight.get(cacheKey);
          if (pending) return new Uint8Array(await pending);
          const signing = signTinMasterSeedAuthorizationBytes({
            walletId: params.walletSession.walletId,
            address: params.walletSession.address,
            message,
          }).then((signature) => {
            cacheTinBalanceAuthorization(cacheKey, bytesToBase64(signature));
            return signature;
          });
          walletAuthorizationInFlight.set(cacheKey, signing);
          try {
            return new Uint8Array(await signing);
          } finally {
            walletAuthorizationInFlight.delete(cacheKey);
          }
        },
      },
      authorizedDevice: await getTinAuthorizedDeviceSigner(params.tin),
      thresholdProvider: accessProvider,
      connection,
      tokens: params.supportedTokens.map((token) => ({
        mint: token.mintAddress,
        decimals: token.decimals ?? 6,
      })),
      signal: params.signal,
      onProgress: params.onProgress,
    });
  } catch (error) {
    throw new Error(`TIN balance unlock failed: ${describeTinBalanceError(error)}`);
  }
  const tokenTotals = new Map(
    balances.tokenBalances.map((token) => [token.mint, BigInt(token.balanceBaseUnits)]),
  );
  const tokens = params.supportedTokens.map((token) => {
    const raw = tokenTotals.get(token.mintAddress) ?? 0n;
    const balance = Number(raw) / 10 ** (token.decimals ?? 6);
    return {
      ...token,
      balance,
      balanceUsd: token.unitPriceUsd ? balance * token.unitPriceUsd : null,
    };
  }).filter((token) => token.balance > 0);
  return {
    tokens,
    pruBalances: balances.pruBalances.map((balance) => {
      const token = params.supportedTokens.find((entry) => entry.mintAddress === balance.mint);
      const decimals = token?.decimals ?? 6;
      return {
        pruIndex: balance.pruIndex,
        publicKey: balance.publicKey,
        tokenMintAddress: balance.mint,
        balance: Number(BigInt(balance.balanceBaseUnits)) / 10 ** decimals,
        balanceBaseUnits: balance.balanceBaseUnits,
      };
    }),
    pruCount: balances.pruCount,
    activePruCount: balances.activePruCount,
    nonZeroPruCount: balances.nonZeroPruCount,
  };
}
