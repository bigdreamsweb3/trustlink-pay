"use client";

import { PublicKey } from "@solana/web3.js";
import { loadPruRoute } from "@trustlink/tsn-sdk/pru-route-auth";

import { createSolanaConnection } from "@/src/lib/rpc";
import { getFrontendTsnMempoolUrl, type TinPruPublicAddress } from "@/src/lib/tins";
import type { WalletTokenOption } from "@/src/lib/types";
import { signSolanaBytes, type ConnectedWalletSession } from "@/src/lib/wallet";

export type TinTokenBalanceResult = {
  tokens: WalletTokenOption[];
  pruCount: number;
  nonZeroPruCount: number;
};

function toTokenAmount(value: number, decimals: number) {
  return Number(value.toFixed(Math.min(decimals, 9)));
}

async function loadPruTokenBalance(params: {
  pru: TinPruPublicAddress;
  token: WalletTokenOption;
}) {
  const connection = createSolanaConnection({ frontendSafe: true });
  const accounts = await connection.getParsedTokenAccountsByOwner(
    new PublicKey(params.pru.publicKey),
    { mint: new PublicKey(params.token.mintAddress) },
    "confirmed",
  );
  const decimals = params.token.decimals ?? 6;
  return accounts.value.reduce((sum, account) => {
    const parsed = account.account.data as {
      parsed: {
        info: {
          tokenAmount: {
            amount: string;
            uiAmount?: number | null;
          };
        };
      };
    };
    const amount =
      parsed.parsed.info.tokenAmount.uiAmount ??
      Number(parsed.parsed.info.tokenAmount.amount) /
        10 ** decimals;
    return sum + amount;
  }, 0);
}

export async function loadTinTokenBalances(params: {
  tin: string;
  walletSession: ConnectedWalletSession;
  supportedTokens: WalletTokenOption[];
  signal?: AbortSignal;
}): Promise<TinTokenBalanceResult> {
  const route = await loadPruRoute(params.tin, {
    publicKey: params.walletSession.address,
    signMessage: async (message) => {
      const signature = await signSolanaBytes({
        walletId: params.walletSession.walletId,
        address: params.walletSession.address,
        message,
      });
      return signature;
    },
  }, getFrontendTsnMempoolUrl());
  if (params.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const activePrus = route.prus.filter((pru) => pru.state !== "SWEPT");
  const nonZeroPrus = new Set<number>();
  const tokenBalances = await Promise.all(
    params.supportedTokens.map(async (token) => {
      let balance = 0;
      for (const pru of activePrus) {
        if (params.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const pruBalance = await loadPruTokenBalance({ pru, token });
        if (pruBalance > 0) nonZeroPrus.add(pru.index);
        balance += pruBalance;
      }
      return {
        ...token,
        balance: toTokenAmount(balance, token.decimals ?? 6),
        balanceUsd: token.unitPriceUsd ? balance * token.unitPriceUsd : null,
      };
    }),
  );
  const tokens = tokenBalances.filter((token) => token.balance > 0);
  return {
    tokens,
    pruCount: route.prus.length,
    nonZeroPruCount: nonZeroPrus.size,
  };
}
