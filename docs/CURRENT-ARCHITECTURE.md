# TSNP, TIP, GPRU, and TCAP: source-backed architecture within TSN

This document describes the checked-in program and service contracts. Source code is not evidence that a circuit was compiled, a verifier was initialized, a program build was deployed, or a settlement completed on chain.

## Protocol roles

- **TIP (Transfer Identity Protocol)** creates and resolves transfer identities. A **TIN (Transfer Identity Number)** is one 10-digit identity within TIP. TIP owns identity and route data; the TIN owner retains the recovery secret.
- **GPRU (Guarded Privacy Routing Unit)** derives one-time DNA keys and verifies hidden-head Groth16 proofs. It does not custody TCAP assets.
- **TSN (Transfer Settlement Network)** is the complete infrastructure that coordinates authenticated intent/work, Node verification, Mother authorization, and exact Cranker submission.
- **TCAP (Transfer Confidential Asset Protocol)** governs approved assets, reserve liabilities, and the shared commitment root. The root is protocol-wide, not a per-TIN balance account.

## Hidden-head credit ABI in source

The TSNP `register_tcap_credit_authorization_v2` instruction accepts a proof-shaped hidden-head argument and invokes TCAP's `credit_gpru_memo_v1`. TCAP validates the approved asset, Mother-derived authorization signer, validity window, current root and next sequence, then invokes GPRU `verify_hidden_head_transition_v1`. Only after proof verification does TCAP advance its shared root and move the matching amount from pending to settled reserve liabilities in the same transaction.

GPRU checks the canonical TIP route root and TCAP root, binds the supplied proof to the Memo instruction following the TSN call, recomputes the action commitment, validates the portfolio-root/point/action prefix, and verifies the Groth16 proof. The updated circuit has nine public inputs: old/new TCAP roots, Memo commitment, action commitment, nullifier, TIP route root, successor portfolio root, and successor balance point X/Y. Its private witness includes one hidden outer head per TIN plus a nested token commitment path, TIP route membership, sequence, and nullifier state. Balance state uses additive BabyJubjub Pedersen commitments; the Memo body contains an owner-encrypted action record used for balance recovery. The updated circuit has not yet been compiled or validated as a proof system.

Node currently returns `GPRU_GROTH16_PROVER_NOT_CONFIGURED` for settlement authorization. There is no configured witness source or proof-generation service, no generated proving/verifying-key artifacts, no validated verification-key byte converter, and no end-to-end proof test. Therefore the program ABI is proof-shaped, but the service flow is not operational. See [GPRU Groth16 prover and key artifacts](./GROTH16-PROVER-AND-KEY-ARTIFACTS.md) for the complete missing-artifact and setup lifecycle.

## TCAP state and Memo records

The hidden-head design does not write a per-TIN TCAP tip PDA. TCAP's shared commitment-root account is updated atomically with reserve liabilities; DBrix Memo remains transaction instruction data. Its fixed prefix carries the successor portfolio root, selected token's Pedersen point, and action commitment; its body contains the owner-encrypted action record. The SDK decrypts actions and replays them to recover balances, while an RPC scanner or indexer must supply complete history.

## Privacy and public-data limits

The hidden-head proof is intended to hide which TIP route/head changed. It does not provide zero linkability: every transition uses the same public writable TCAP root, exposing protocol participation and global ordering. The ABI also exposes action kind, token ID, amount, nullifier, root values, Memo commitment, TIP route root, and successor balance point. Solana transaction accounts, timing, and Memo bytes remain public even when Memo contents are encrypted.

## Debit, exit, and settlement boundary

The circuit source includes debit and exit arithmetic constraints, but the TSN/SDK/Node/Cranker execution path and TCAP liquidity/payout checks have not been verified end to end for those actions. They remain disabled until authorization, affordability, successor commitment, reserve conservation, payout behavior, and root advancement are proven together. The existence of circuit constraints is not evidence that debit or exit is enabled.

Receiver acceptance, Node verification, Cranker submission, reserve-funding confirmation, and TCAP transition confirmation are distinct events. Confirmed reserve funding does not prove that a follow-up settlement succeeded. Confirm a chain result from the transaction signature and relevant account state on the target cluster.

## Canonical source pointers

- TIP Registrar: `tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/`
- GPRU program and circuit: `tsn-protocol/programs/gpru/src/` and `tsn-protocol/programs/gpru/circuits/hidden_head_v1/`
- TSNP authorization CPI: `tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization_v2.rs`
- TCAP atomic credit instruction: `tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_gpru_memo_v1.rs`
- Prover/key lifecycle: `./GROTH16-PROVER-AND-KEY-ARTIFACTS.md`

Use these contracts over historical design notes. Historical experiments and smoke-test runbooks are labeled as such and are not normative for the current proof ABI.
