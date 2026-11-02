# TSNP, TIP, GPRU, and TCAP: source-backed architecture within TSN

TrustLink Labs is building foundational infrastructure for the **Internet of
Value** through **TSN**, a hybrid settlement network designed to make value
transfer interoperable, identity-aware, and privacy-preserving across
applications and blockchain networks. The model combines off-chain identity
resolution, coordination, and verification with on-chain authorization and
asset settlement. Cross-network interoperability describes the architecture's
direction; it is not a claim that every route is operational.

This document describes the checked-in program and service contracts. Source code is not evidence that a circuit was compiled, a verifier was initialized, a program build was deployed, or a settlement completed on chain.

For the full component, function, lifecycle, invariant and source catalog, start with the [Laboratory engineering record](./laboratory/README.md) and [canonical implementation map](./laboratory/architecture-map.md).

## Protocol roles

- **TIP (Transfer Identity Protocol)** creates and resolves transfer identities. A **TIN (Transfer Identity Number)** is one 10-digit identity within TIP. TIP owns identity and route data; the TIN owner retains the recovery secret.
- **GPRU (Guarded Privacy Routing Unit)** guards the integrity and privacy of the user's private state presented to TCAP. Its hidden-head proof is intended to establish that the hidden state is current and the proposed transition follows from it, without exposing the TIN or hidden per-TIN state in the proof. GPRU does not custody TCAP assets.
- **TSN (Transfer Settlement Network)** is the complete infrastructure that coordinates authenticated intent/work, Node verification, Mother authorization, and exact Cranker submission.
- **TCAP (Transfer Confidential Asset Protocol)** governs approved assets, reserve liabilities, and the shared commitment root. The root is protocol-wide, not a per-TIN balance account.

In plain terms, GPRU checks the private state and proposed balance change that TCAP relies on; TCAP remains the authority for funds and applies the accepted change atomically. The native-credit proof hides the recipient TIN route and private predecessor witness from the on-chain statement. The owner retains private recovery/history material. However, Node derives the published nullifier from the public deposit signature and TCAP program ID, so an observer can compute the funding-to-credit link without a secret. Amount, asset, shared roots, successor point, ciphertext, accounts and timing are also visible, and the authorized Node handles private resolution/witnesses. Direct wallet transfers expose their endpoints; confidential debit and exit require separate execution evidence. The implemented source does not establish general unlinkability, owner-only knowledge or completed live settlement. Required artifact/witness settings and matching chain/verifier state remain runtime gates; see the [canonical privacy record](./laboratory/cryptography.md).

## Hidden-head credit ABI in source

The TSNP `register_tcap_credit_authorization_v2` instruction accepts a proof-shaped hidden-head argument and invokes TCAP's `credit_gpru_memo_v1`. TCAP validates the approved asset, Mother-derived authorization signer, validity window, current root and next sequence, then invokes GPRU `verify_hidden_head_transition_v1`. Only after proof verification does TCAP advance its shared root and move the matching amount from pending to settled reserve liabilities in the same transaction.

GPRU checks the canonical TIP route root and TCAP root, binds the supplied proof to the Memo instruction following the TSN call, recomputes the action commitment, validates the seven-field portfolio-root/point/action/delta-ciphertext prefix, and verifies the Groth16 proof. The circuit has twelve public inputs: old/new TCAP roots, Memo commitment, action commitment, nullifier, TIP route root, successor portfolio root and point, encrypted blinding delta, and ephemeral point. Its private witness includes one hidden outer head per TIN, nested token commitment path, TIP route membership, sequence, nullifier state, and ciphertext opening. Balance state uses additive BabyJubjub Pedersen commitments; the Memo body contains an owner-encrypted action record without the delta. The proof constrains the public one-time ciphertext to the exact delta used in the Pedersen transition. The local Node witness/prover adapters are implemented, and the November 2 experiment verified the matching November 1 development setup, local proofs and four SBF builds. Runtime configuration, deployed verifier/root state and confirmed settlement are separate gates; see [the dated readiness record](./laboratory/experiments/EXP-20261102-hidden-head.md).

The local Node witness/prover adapters are implemented, and the November 2 experiment verified the matching November 1 development setup, local proofs and four SBF builds. Runtime configuration, deployed verifier/root state and confirmed settlement are separate gates; see [the dated readiness record](./laboratory/experiments/EXP-20261102-hidden-head.md). Missing artifact settings still produce `GPRU_GROTH16_PROVER_NOT_CONFIGURED`; missing chain-selected snapshots produce `GPRU_HIDDEN_HEAD_WITNESS_UNAVAILABLE`. The last captured pre-deployment chain/environment state is dated in that record and may change during operator deployment.

## TCAP state and Memo records

The hidden-head design does not write a per-TIN TCAP tip PDA. TCAP's shared commitment-root account is updated atomically with reserve liabilities; DBrix Memo remains transaction instruction data. Its fixed prefix carries the successor portfolio root, selected token's Pedersen point, and action commitment; its body contains the owner-encrypted action record. The SDK decrypts actions and replays them to recover balances, while an RPC scanner or indexer must supply complete history.

## Privacy and public-data limits

The hidden-head proof is intended to hide which TIP route/head changed. Every transition uses the same public writable TCAP root, which exposes protocol participation and global ordering but is not a per-TIN identity pointer. The ABI exposes action kind, token ID, amount, nullifier, root values, Memo commitment, TIP route root, and successor balance point. Solana transaction accounts, timing, and Memo bytes remain public even when Memo contents are encrypted; they do not create a public pointer to the hidden TIN or its private predecessor. The owner retains the record lineage, while the proof lets TSNP/TCAP validate a transition without learning that lineage. The proof path is not currently operational end to end.

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
