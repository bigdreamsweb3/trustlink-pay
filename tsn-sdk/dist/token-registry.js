const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const DEFAULT_ALLOWED_TOKENS = [
    {
        mintAddress: DEVNET_USDC_MINT,
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
    },
];
function normalizeToken(input) {
    if (!input || typeof input !== "object")
        return null;
    const candidate = input;
    const mintAddress = String(candidate.mintAddress ?? "").trim();
    if (!mintAddress)
        return null;
    const symbol = String(candidate.symbol ?? "").trim().toUpperCase();
    const name = String(candidate.name ?? "").trim();
    const decimalsRaw = candidate.decimals;
    const decimals = typeof decimalsRaw === "number" && Number.isFinite(decimalsRaw)
        ? decimalsRaw
        : undefined;
    return {
        mintAddress,
        symbol: symbol || mintAddress.slice(0, 6),
        name: name || symbol || "Unknown Token",
        ...(decimals !== undefined ? { decimals } : {}),
    };
}
export function tsnGetAllowedSplTokens(env) {
    const raw = env.SOLANA_ALLOWED_SPL_TOKENS?.trim();
    if (!raw)
        return DEFAULT_ALLOWED_TOKENS;
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return DEFAULT_ALLOWED_TOKENS;
        const normalized = parsed
            .map((entry) => normalizeToken(entry))
            .filter((entry) => entry !== null);
        return normalized.length > 0 ? normalized : DEFAULT_ALLOWED_TOKENS;
    }
    catch {
        return DEFAULT_ALLOWED_TOKENS;
    }
}
export function tsnResolveSplTokenInput(tokenInput, env) {
    const trimmed = tokenInput.trim();
    const tokens = tsnGetAllowedSplTokens(env);
    const byMint = tokens.find((token) => token.mintAddress === trimmed);
    if (byMint)
        return byMint;
    const bySymbol = tokens.find((token) => token.symbol === trimmed.toUpperCase());
    if (bySymbol)
        return bySymbol;
    return {
        mintAddress: trimmed,
        symbol: trimmed.slice(0, 6).toUpperCase(),
        name: "Custom Token",
    };
}
