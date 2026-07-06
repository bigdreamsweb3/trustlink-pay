"use client";

import { PublicKey } from "@solana/web3.js";
import { loadPruRoute } from "@trustlink/tsn-sdk/pru-route-auth";

import { createSolanaConnection } from "@/src/lib/rpc";
import { getFrontendTsnMempoolUrl, type TinPruPublicAddress } from "@/src/lib/tins";
import type { WalletTokenOption } from "@/src/lib/types";
import { signSolanaBytes, type ConnectedWalletSession } from "@/src/lib/wallet";

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
  const balanceBaseUnits = accounts.value.reduce((sum, account) => {
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
    return sum + BigInt(parsed.parsed.info.tokenAmount.amount);
  }, 0n);
  return {
    balance: Number(balanceBaseUnits) / 10 ** decimals,
    balanceBaseUnits: balanceBaseUnits.toString(),
  };
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
  const pruBalances: TinTokenBalanceResult["pruBalances"] = [];
  const tokenBalances = await Promise.all(
    params.supportedTokens.map(async (token) => {
      let balance = 0;
      for (const pru of activePrus) {
        if (params.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const pruBalance = await loadPruTokenBalance({ pru, token });
        if (pruBalance.balance > 0) {
          nonZeroPrus.add(pru.index);
          pruBalances.push({
            pruIndex: pru.index,
            publicKey: pru.publicKey,
            tokenMintAddress: token.mintAddress,
            balance: pruBalance.balance,
            balanceBaseUnits: pruBalance.balanceBaseUnits,
          });
        }
        balance += pruBalance.balance;
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
    pruBalances,
    pruCount: route.prus.length,
    nonZeroPruCount: nonZeroPrus.size,
  };
}
