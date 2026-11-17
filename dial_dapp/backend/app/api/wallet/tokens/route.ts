export const runtime = "nodejs";

import { listSupportedWalletTokens } from "@/app/blockchain/solana";
import { CACHE_TAGS, CACHE_TTL_SECONDS, cachedQuery } from "@/app/lib/cache";
import { ok, toErrorResponse } from "@/app/lib/http";
import { walletTokenLookupSchema } from "@/app/lib/validation";
import { getUsdPricesForSymbols } from "@/app/services/pricing";

const getCachedWalletTokens = cachedQuery(
  "wallet-tokens-v1",
  async (walletAddress: string) => {
    const tokens = await listSupportedWalletTokens(walletAddress);
    const prices = await getUsdPricesForSymbols(tokens.map((token) => token.symbol));
    return tokens.map((token) => {
      const unitPriceUsd = prices[token.symbol] ?? null;
      const balanceUsd = unitPriceUsd != null ? Number((token.balance * unitPriceUsd).toFixed(2)) : null;

      return {
        ...token,
        unitPriceUsd,
        balanceUsd
      };
    });
  },
  {
    revalidate: CACHE_TTL_SECONDS.walletTokens,
    tags: [CACHE_TAGS.walletTokens],
  },
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = walletTokenLookupSchema.parse(body);

    return ok({
      tokens: await getCachedWalletTokens(payload.walletAddress)
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
