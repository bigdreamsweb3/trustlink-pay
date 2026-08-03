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
  params.onProgress?.("Decrypting the TIN route on this authorized device...");
  const identity = await resolveTinFromChain(params.tin);
  // Legacy TIN accounts predate the device/threshold architecture. They may
  // still be resolved and displayed, but must not invoke the new threshold
  // action or turn its missing configuration into a frontend error.
  if (identity.accountKind === "legacy") {
    params.onProgress?.("Legacy TIN detected; private ZK-PRU balances require a TIN upgrade.");
    return {
      tokens: params.supportedTokens.map((token) => ({ ...token, balance: 0, balanceUsd: null })),
      pruBalances: [],
      pruCount: 0,
      activePruCount: 0,
      nonZeroPruCount: 0,
    };
  }
  const connection = createSolanaConnection({ frontendSafe: true });
  const account = await connection.getAccountInfo(new PublicKey(identity.registry), "confirmed");
  if (!account) throw new Error("The selected TIN account is unavailable on Devnet.");
  const decoded = decodeTinAccount(account.data);
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
    thresholdProvider: await getBrowserTinMasterSeedProvider(),
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
