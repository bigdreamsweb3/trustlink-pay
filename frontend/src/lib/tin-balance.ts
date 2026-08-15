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
import { getBrowserTinMasterSeedProvider } from "@/src/lib/tsn-threshold-provider";
import { getTinAuthorizedDeviceSigner } from "@/src/lib/tsn-device-authorization";

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

export async function loadTinTokenBalances(params: {
  tin: string;
  walletSession: ConnectedWalletSession;
  supportedTokens: WalletTokenOption[];
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}): Promise<TinTokenBalanceResult> {
  // Fail before querying the chain when production has no configured
  // multi-device key-release provider. This avoids displaying a misleading
  // zero balance and avoids unnecessary RPC calls.
  const thresholdProvider = await getBrowserTinMasterSeedProvider();
  params.onProgress?.("Decrypting the TIN route on this authorized device...");
  const identity = await resolveTinFromChain(params.tin);
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
  const balances = await loadTinPrivateTokenBalances({
    tin: params.tin,
    pruConfigurationHash,
    envelope: decoded.encryptedMasterSeed,
    ownerWallet: {
      publicKey: params.walletSession.address,
      signMessage: (message) => signTinMasterSeedAuthorizationBytes({
        walletId: params.walletSession.walletId,
        address: params.walletSession.address,
        message,
      }),
    },
    authorizedDevice: await getTinAuthorizedDeviceSigner(params.tin),
    thresholdProvider,
    connection,
    tokens: params.supportedTokens.map((token) => ({
      mint: token.mintAddress,
      decimals: token.decimals ?? 6,
    })),
    signal: params.signal,
    onProgress: params.onProgress,
  });
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
