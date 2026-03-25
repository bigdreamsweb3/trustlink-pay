export const runtime = "nodejs";

import { listSupportedWalletTokens } from "@/app/blockchain/solana";
import { ok, toErrorResponse } from "@/app/lib/http";
import { walletTokenLookupSchema } from "@/app/lib/validation";
import { getUsdPricesForSymbols } from "@/app/services/pricing";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = walletTokenLookupSchema.parse(body);
    const tokens = await listSupportedWalletTokens(payload.walletAddress);
    const prices = await getUsdPricesForSymbols(tokens.map((token) => token.symbol));
    const enrichedTokens = tokens.map((token) => {
      const unitPriceUsd = prices[token.symbol] ?? null;
      const balanceUsd = unitPriceUsd != null ? Number((token.balance * unitPriceUsd).toFixed(2)) : null;

      return {
        ...token,
        unitPriceUsd,
        balanceUsd
      };
    });

    return ok({
      tokens: enrichedTokens
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
