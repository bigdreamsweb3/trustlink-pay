# Operations and testing

## Repository areas

| Area                                                | Role                                                         |
| --------------------------------------------------- | ------------------------------------------------------------ |
| `frontend/`                                         | TrustLink Pay application and route review UI                |
| `backend/`                                          | Application authentication, profile, notifications, and APIs |
| `tsn-protocol/programs/transfer-identity-protocol/` | TIN program and client tooling                               |
| `tsn-protocol/sdks/tsn-sdk/`                        | Planning, commitments, local authorization, and state policy |
| `tsn-protocol/services/tsn-node/`                   | TSN Node implementation and intent/claim coordination        |
| `tsn-protocol/services/tsn-cranker-op-daemon/`      | Cranker operator and fee-paying submission                   |
| `tsn-protocol/programs/tsn/protocol/`               | Solana TSNP program and on-chain tests                        |
| `tsn-protocol/programs/gpru/`                       | GPRU key-proof and encrypted-transition program              |
| `tsn-protocol/programs/tcap-protocol/`              | TCAP asset, reserve, and shared-root instructions             |

The current wallet-to-TIN credit flow is the GPRU-checked Memo transition
followed by TCAP's shared commitment-root update. Epoch-treasury opaque-slot
and `AcceptedIntent` instructions are a separate program capability. Legacy
TCAP per-TIN TIP instructions are not account requirements of the active
credit caller.

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

- **SDK and frontend:** TIN resolution from TIP, wallet authorization, funding
  submission, intent status, and privacy-safe activity reporting.
- **Receiver and Node:** authenticated intent acceptance, signature and
  transaction verification, settlement-work creation, lease/status changes,
  and retry behavior.
- **Cranker:** exact authorized funding and settlement submission, TCAP/GPRU
  instruction construction, signature reporting, and safe failure handling.
- **Rust/Anchor:** GPRU DNA-key and encrypted-credit relation checks; TCAP
  approved-asset, authorization, shared-root predecessor, sequence, and
  atomic-update checks. Test epoch-slot instructions separately from the
  wallet-to-TIN credit path.
- **Integration:** successful funding and settlement, duplicate/stale global
  root rejection, expired or malformed authorization, wrong route/key proof,
  failed settlement recovery, and confirmation evidence. Do not treat a
  supplied ciphertext as current per-TIN state: the active path has no
  authenticated per-TIN latest-head check.

## Evidence requirements

Record cluster, program IDs, work and lease identifiers, commitments,
transaction signatures, slots, sanitized logs, fees, and the relevant fetched
program/account state. Label simulation as simulation; only a confirmed
signature and fetched account state qualify as confirmed Devnet evidence. Do
not infer a private balance from the Memo commitment or global root.

## Deployment and rollback

Deploy programs from the repository's WSL/Anchor workflow and verify the
resulting program account before testing. Do not replace program IDs or
upgrade-authority records casually. Roll back by stopping the affected
component, restoring the previously verified program/configuration, and
preserving evidence; never reset Git history to hide a failed run.

## Troubleshooting

- **No route:** inspect TIP resolution and the Node's route-verification result.
- **Funding rejected:** inspect the sender-signed transaction's blockhash,
  cluster, signature, and funding verification result; a Cranker cannot refresh
  an already signed transaction's blockhash.
- **Settlement not executed:** inspect Receiver work status, Node verification,
  Cranker lease/report, and the TCAP/GPRU simulation or confirmed signature.
- **Stale transition:** inspect the shared TCAP root and sequence. This check
  is global and does not establish per-TIN ciphertext freshness.
- **Cluster mismatch:** rebuild and re-authorize the plan for the selected
  cluster.
