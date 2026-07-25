/** Development TCAP program identity. Keep synchronized with declare_id! and Anchor.toml. */
export const TCAP_PROGRAM_ID = "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x" as const;

export const TCAP_PDA_SEEDS = Object.freeze({
  globalConfig: "tcap:global-config:v1",
  assetRegistry: "tcap:asset-registry:v1",
  assetEntry: "tcap:asset-entry:v1",
  assetState: "tcap:asset-state:v1",
  reserveState: "tcap:reserve-state:v1",
  reserveAuthority: "tcap:reserve-authority:v1",
  futureVault: "tcap:future-vault:v1",
  nullifierRegistry: "tcap:nullifier-registry:v1",
  nullifierShard: "tcap:nullifier-shard:v1",
  nullifier: "tcap:nullifier:v1",
  commitmentRoot: "tcap:commitment-root:v1",
  tsnAuthorizationReceipt: "tcap:tsn-auth-receipt:v1",
} as const);

export type TcapPdaSeed = (typeof TCAP_PDA_SEEDS)[keyof typeof TCAP_PDA_SEEDS];
