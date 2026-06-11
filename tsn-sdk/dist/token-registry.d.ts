export type TsnAllowedToken = {
    mintAddress: string;
    symbol: string;
    name: string;
    decimals?: number;
};
export declare function tsnGetAllowedSplTokens(env: Record<string, string | undefined>): TsnAllowedToken[];
export declare function tsnResolveSplTokenInput(tokenInput: string, env: Record<string, string | undefined>): TsnAllowedToken;
//# sourceMappingURL=token-registry.d.ts.map