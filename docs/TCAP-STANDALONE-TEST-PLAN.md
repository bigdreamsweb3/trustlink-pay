# TCAP standalone implementation and attack-test plan

TCAP is developed and tested independently before any TIP or TSN integration.
The first integration target is a normal Solana wallet and token-account flow on
a local validator. No production RPC, user wallet, or real funds are permitted
in this phase.

## Standalone scope

TCAP owns the asset registry, reserve metadata, reserve authority PDA,
commitments, nullifiers, confidential roots, and future proof/settlement state.
TSN authorization records and CPI settlement are out of scope until standalone
TCAP invariants are proven.

The implementation sequence is:

1. initialization-only metadata (complete);
2. localnet asset registration and non-funded reserve setup;
3. audited wallet deposit and reserve accounting;
4. confidential note creation and transfer;
5. nullifier consumption and replay resistance;
6. proof-verifier integration;
7. confidential outputs and public redemption;
8. adversarial, property-based, fuzz, and invariant testing at every step.

No step may enable the next step's fund movement before its tests and review
gates pass.

## Required invariants

- Only the TCAP reserve-authority PDA can control a TCAP vault.
- Governance and emergency authorities cannot withdraw reserve assets.
- External wallets, crankers, and legacy TSN PDAs cannot become reserve authority.
- Asset identity is token-program plus exact mint, never a symbol or name.
- Deposits, liabilities, notes, outputs, and redemptions conserve value.
- Nullifiers are domain-separated, replay-protected, and bound to the expected root.
- Paused or uninitialized state rejects every transition.
- Invalid owners, seeds, mints, roots, proofs, epochs, and authorities reject.

## Test environments

| Environment | Allowed use |
| --- | --- |
| Rust unit tests | Pure PDA, serialization, arithmetic, and invariant tests |
| Local validator | Wallet/token flows with disposable test keypairs and a test mint |
| Devnet | Only after localnet and independent review gates pass |
| Mainnet/production RPC | Forbidden during development and attack generation |

