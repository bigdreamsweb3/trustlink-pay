const TOKEN_TO_COINGECKO_ID: Record<string, string> = {
  SOL: "solana",
  USDC: "usd-coin",
  USDT: "tether"
};

const STABLE_PRICE_FALLBACKS: Record<string, number> = {
  USDC: 1,
  USDT: 1
};

type PriceCacheEntry = {
  expiresAt: number;
  prices: Record<string, number>;
};

let cachedPrices: PriceCacheEntry | null = null;

function uniqueSymbols(symbols: string[]) {
  return [...new Set(symbols.map((symbol) => symbol.toUpperCase()).filter(Boolean))];
}

export async function getUsdPricesForSymbols(symbols: string[]) {
  const normalizedSymbols = uniqueSymbols(symbols);
  const now = Date.now();

  if (cachedPrices && cachedPrices.expiresAt > now) {
    return normalizedSymbols.reduce<Record<string, number>>((result, symbol) => {
      if (cachedPrices?.prices[symbol] != null) {
        result[symbol] = cachedPrices.prices[symbol];
      }
      return result;
    }, {});
  }

  const ids = normalizedSymbols
    .map((symbol) => TOKEN_TO_COINGECKO_ID[symbol])
    .filter(Boolean);

  if (ids.length === 0) {
    return normalizedSymbols.reduce<Record<string, number>>((result, symbol) => {
      if (STABLE_PRICE_FALLBACKS[symbol] != null) {
        result[symbol] = STABLE_PRICE_FALLBACKS[symbol];
      }
      return result;
    }, {});
  }

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd`,
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error(`Price request failed with ${response.status}`);
    }

    const payload = (await response.json()) as Record<string, { usd?: number }>;
    const prices = normalizedSymbols.reduce<Record<string, number>>((result, symbol) => {
      const id = TOKEN_TO_COINGECKO_ID[symbol];
      const usdPrice = id ? payload[id]?.usd : undefined;

      if (typeof usdPrice === "number") {
        result[symbol] = usdPrice;
        return result;
      }

      if (STABLE_PRICE_FALLBACKS[symbol] != null) {
        result[symbol] = STABLE_PRICE_FALLBACKS[symbol];
      }

      return result;
    }, {});

    cachedPrices = {
      expiresAt: now + 60_000,
      prices
    };

    return prices;
  } catch {
    return normalizedSymbols.reduce<Record<string, number>>((result, symbol) => {
      if (STABLE_PRICE_FALLBACKS[symbol] != null) {
        result[symbol] = STABLE_PRICE_FALLBACKS[symbol];
      }
      return result;
    }, {});
  }
}

export async function enrichPaymentsWithUsd<T extends { token_symbol: string; amount: string | number }>(payments: T[]) {
  const prices = await getUsdPricesForSymbols(payments.map((payment) => payment.token_symbol));

  return payments.map((payment) => {
    const unitPriceUsd = prices[payment.token_symbol.toUpperCase()] ?? null;
    const numericAmount = Number(payment.amount);
    const amountUsd = unitPriceUsd != null ? Number((numericAmount * unitPriceUsd).toFixed(2)) : null;

    return {
      ...payment,
      unit_price_usd: unitPriceUsd,
      amount_usd: amountUsd
    };
  });
}
