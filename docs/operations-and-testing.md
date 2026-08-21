# Operations and testing

## Repository areas

| Area | Role |
| --- | --- |
| `frontend/` | TrustLink Pay application and route review UI |
| `backend/` | Application authentication, profile, notifications, and APIs |
| `transfer-identity-protocol/` | TIN program and client tooling |
| `tsn-protocol/tsn-sdk/` | Planning, commitments, local authorization, and state policy |
| `tsn-protocol/tsn-node/` | TSN Node implementation and intent/claim coordination |
| `tsn-protocol/tsn-cranker-op-daemon/` | Cranker operator and fee-paying submission |
| `tsn-protocol/tsn/protocol/` | Solana TSN Program and on-chain tests |

## Local development

Use a local validator for deterministic program and integration tests. Local
state is not Devnet evidence. Start only the components required for the test:

1. local validator and deployed test programs;
2. TSN Node and RPC gateway;
3. Cranker with an operator key;
4. frontend or SDK test harness.

The application backend is not a Solana validator or TSN Node. Keep it out of
the TSN-only stack when testing protocol execution.

## Devnet operations

Before a Devnet run, verify:

- cluster URL and program IDs;
- executable program accounts and upgrade authorities;
- token mint, token program, and account ownership;
- test wallet balance and fee budget;
- TSN execution PDA and escrow PDA derivations;
- Cranker operator identity;
- node/Cranker endpoints bound to localhost or an approved private network.

Never infer deployed behavior from local IDLs alone. A Devnet instruction is
proven by simulation/submission logs, signatures, and fetched account state.

## Test layers

- **SDK:** canonical serialization, source selection, adaptive tranche,
  bigint/base-unit accounting, commitment, fee, change, local decryption, and
  scoped signing.
- **Frontend:** route review, wallet/device approval, no-secret persistence,
  status polling, cancellation, and evidence display.
- **TSN Node:** signature verification, immutable plans, reservation
  concurrency, replay, expiry, and settlement work.
- **Cranker:** public-plan-only operation, deterministic batches, retries,
  fee payment, and no-user-key tests.
- **Rust/Anchor:** Ed25519 parsing, delegate/allowance checks, PDA authority,
  opaque slot transitions, replay, and state-version rejection.
- **Integration:** four routes, receiving accumulation, adaptive spending,
  change routing, wallet top-up, tampering, stale state, wrong signer, wrong
  delegate, expiry, and recovery.

## Evidence requirements

Record cluster, program IDs, plan commitment, transaction signatures, slots,
logs, fees, escrow balances, source/recipient balances, Payment PDA state,
delegate state, nonce, and replay state. Label simulation as simulation; only a
confirmed signature and fetched account state qualify as confirmed Devnet
evidence.

## Deployment and rollback

Deploy programs from the repository's WSL/Anchor workflow and verify the
resulting program account before testing. Do not replace program IDs or
upgrade-authority records casually. Roll back by stopping the affected
component, restoring the previously verified program/configuration, and
preserving evidence; never reset Git history to hide a failed run.

## Troubleshooting

- **No route:** inspect TIN resolution, active receiving state, and device
  authorization; do not make the node derive a route.
- **Plan rejected:** compare canonical serialization and every bound field.
- **No claim:** inspect node reservation and Cranker health; do not replan in
  the Cranker.
- **Escrow failure:** inspect PDA seeds, delegate allowance, Payment PDA state,
  nonce, and replay state.
- **Cluster mismatch:** rebuild and re-authorize the plan for the selected
  cluster.
