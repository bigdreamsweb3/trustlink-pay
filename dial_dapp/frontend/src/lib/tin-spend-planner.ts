import { planTinBalanceSpend, selectPruSpendInputs, type TinSpendPlan } from "@trustlink/tsn-sdk/tin-balance-spend-planner";

import { loadTinTokenBalances } from "@/src/lib/tin-balance";
import type { UserProfile, WalletTokenOption } from "@/src/lib/types";
import type { ConnectedWalletSession } from "@/src/lib/wallet";

export type TinSpendPlanResult = TinSpendPlan & {
  pruFundingAmountBaseUnits: string;
  walletFundingAmountBaseUnits: string;
  tin: string | null;
  tokenSymbol: string;
  tokenDecimals: number;
  pruBalanceUi: number;
  walletBalanceUi: number;
  routeLoaded: boolean;
  pruSpendSelections: Array<{
    pruIndex: number;
    amountBaseUnits: string;
    nonce: number;
  }>;
};

function toBaseUnits(value: number, decimals: number) {
  if (!Number.isFinite(value) || value < 0) return 0n;
  return BigInt(Math.round(value * 10 ** decimals));
}

function fromBaseUnits(value: string, decimals: number) {
  return Number(value) / 10 ** decimals;
}

export async function buildTinSpendPlan(params: {
  user: UserProfile;
  walletSession: ConnectedWalletSession;
  token: WalletTokenOption;
  amountUi: number;
  feeAmountUi: number;
  signal?: AbortSignal;
}): Promise<TinSpendPlanResult> {
  const decimals = params.token.decimals ?? 6;
  const walletBalanceBaseUnits = toBaseUnits(params.token.balance, decimals);
  const requestedBaseUnits = toBaseUnits(params.amountUi, decimals);
  const feeBaseUnits = toBaseUnits(params.feeAmountUi, decimals);
  let pruBalanceBaseUnits = 0n;
  let routeLoaded = false;
  let pruBalances: Array<{
    pruIndex: number;
    tokenMintAddress: string;
    balanceBaseUnits: string;
  }> = [];

  if (params.user.tin) {
    try {
      const tinBalances = await loadTinTokenBalances({
        tin: params.user.tin,
        walletSession: params.walletSession,
        supportedTokens: [params.token],
        signal: params.signal,
      });
      const tokenBalance = tinBalances.tokens.find(
        (token) => token.mintAddress === params.token.mintAddress,
      );
      pruBalanceBaseUnits = toBaseUnits(tokenBalance?.balance ?? 0, decimals);
      pruBalances = tinBalances.pruBalances;
      routeLoaded = true;
    } catch (error) {
      // A missing finalized route must not block the public-wallet → TIN
      // compatibility path. The device route is optional for wallet funding;
      // the SDK will select wallet_only_v2 when no local PRU state is available.
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("404") && !message.includes("not found")) throw error;
      routeLoaded = false;
    }
  }

  const plan = planTinBalanceSpend({
    requestedAmountBaseUnits: requestedBaseUnits,
    feeAmountBaseUnits: feeBaseUnits,
    pruAvailableBaseUnits: pruBalanceBaseUnits,
    walletAvailableBaseUnits: walletBalanceBaseUnits,
  });
  const pruSpendSelections = selectPruSpendInputs({
    tokenMintAddress: params.token.mintAddress,
    spendBaseUnits: plan.pruSpendBaseUnits,
    balances: pruBalances,
  });

  return {
    ...plan,
    pruFundingAmountBaseUnits: String((plan as unknown as Record<string, unknown>).pruFundingAmountBaseUnits ?? "0"),
    walletFundingAmountBaseUnits: String((plan as unknown as Record<string, unknown>).walletFundingAmountBaseUnits ?? "0"),
    tin: params.user.tin ?? null,
    tokenSymbol: params.token.symbol,
    tokenDecimals: decimals,
    pruBalanceUi: fromBaseUnits(pruBalanceBaseUnits.toString(), decimals),
    walletBalanceUi: params.token.balance,
    routeLoaded,
    pruSpendSelections,
  };
}
