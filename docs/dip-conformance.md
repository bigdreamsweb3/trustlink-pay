# DIP-Arc conformance

Checked against `docs/tsn_docs_dip_deposit_ingress_protocol.md` in the TrustLink Pay repo. Router: `TSNArcDepositRouter` on Arc Testnet.

## Invariants

| #   | DIP invariant                                                                      | Status   | Notes                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No TIN, recipient or identity in state, events or calldata                         | Met      | Tested: the event has one address field (the payer). The commitment is salted in the demo resolver.                                             |
| 2   | `intentId` unique per (payer, commitment, amount, expiry)                          | Met      | Tested, including a different payer and chain ID.                                                                                               |
| 3   | Mint recipient is the shared reserve, never derived from a commitment or recipient | Partly   | The contract cannot tell a pool address from a per-recipient one. Enforce in code review and deployment. The testnet deploy uses a placeholder. |
| 4   | One credit per `intentId`                                                          | Not here | Node responsibility.                                                                                                                            |
| 5   | Credits never exceed verified reserve inflow                                       | Not here | Node and TCAP responsibility.                                                                                                                   |
| 6   | No admin path moves user funds; zero balance between transactions                  | Met      | Rescue only recovers stray USDC. Tested with an invariant.                                                                                      |
| 7   | Pause blocks new deposits only                                                     | Met      | Tested.                                                                                                                                         |
| 8   | Amounts in 6-decimal ERC-20 units                                                  | Met      | The app never reads the 18-decimal native view.                                                                                                 |

## Differences from the DIP text

- `routeCommitment` is an indexed event topic in the built contract. The DIP signature leaves it unindexed. Indexing makes deposits searchable by commitment, which is harmless because the commitment is opaque.
- The handoff payload carries `cctp.sourceDomain` and `cctp.destinationDomain` but no `nonce`. The nonce is not known when the burn happens, so the Node reads it from Circle's attestation for `arcTxHash`.
- Step 6 (encrypted receipt envelope and receipt commitment) is not built.

## Evidence levels

| Level      | Status                                                              |
| ---------- | ------------------------------------------------------------------- |
| Design     | Complete (DIP document)                                             |
| Source     | Done                                                                |
| Tests      | Done: 66 Foundry tests against mocks                                |
| Testnet    | Deployed on Arc Testnet. A real CCTP deposit has not been sent yet. |
| Mainnet    | Not started                                                         |
| End to end | Not started (needs the Solana mint and TCAP credit)                 |

## Found while checking the rest of the repo

- `SepoliaAnchor.sol` publishes `tinHash` and `sealedTipHeadHash` in public EVM state and in the `TinExitAnchored` event, and anyone can call `recordTinExit`. This breaks DIP invariant 1 for the exit path.
- `sdks/tsn-sdk/src/cross-chain.ts` still carries `tinHash` in the TIN recipient type and in the exit replay key. The new attestation layer should bind identity inside the attestation or the Node, and publish only a commitment.
