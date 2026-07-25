# TCAP Permissionless Asset Model

TCAP permissionlessly supports technically valid token assets. It maintains isolated reserve and confidential ownership accounting for each mint, while TSN determines which assets are exposed or accepted within a particular payment experience.

## Canonical Architecture Principles

1. **Permissionless Acceptance:** TCAP accepts any technically valid supported mint. No administrator approval or global allowlist registry is required to fund or settle an asset.
2. **Commercial Neutrality:** TCAP does not decide commercial asset acceptance. It is strictly the confidential accounting and settlement layer.
3. **TSN Policy Ownership:** TSN owns network-level asset policy. TSN determines which assets are displayed to users, supported by service providers, or accepted for specific settlement routes.
4. **Accounting Infrastructure, Not Approval:** Per-mint TCAP state (`TcapAssetStateV1`) is strictly accounting infrastructure containing decimals and token program binding. It does not imply approval or commercial support.
5. **Reserve Isolation:** Reserve vaults are strictly isolated per mint.
6. **Liability Isolation:** Confidential liabilities are strictly isolated per mint. A funding claim on Mint A cannot affect the liabilities of Mint B.
7. **Cryptographic Binding:** Commitments must cryptographically bind the mint and token program.
8. **Settlement Identity:** Settlement releases or credits only the asset originally funded. It cannot change the asset.
9. **Exit Identity:** Exits must release the identical asset represented by the confidential ownership being exited.
10. **No Internal Conversion:** Cross-asset conversion is not performed internally by TCAP.
11. **External Swaps Only:** Token swaps exist entirely outside TCAP unless explicitly introduced through a separate, explicitly authorized TSN integration route.
12. **Mandatory Safety Validation:** Token-program safety validation (verifying mint ownership, decimals, account layouts, and rejecting unsupported extensions) remains mandatory to protect protocol accounting.

This model is deployed in the STABLE_TCAP_DEVNET program.
