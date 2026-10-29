# TIP, GPRU, TSN, and TCAP: source-backed architecture

This document describes the checked-in program and service contracts. It separates the wired credit path from the hidden-head proof path that currently exists only as program and circuit source. A source implementation is not evidence that a path has been built, deployed, initialized, audited, or exercised on chain.

## Protocol roles

- **TIP (Transfer Identity Protocol)** creates and resolves transfer identities. A **TIN (Transfer Identity Number)** is one 10-digit identity within TIP. The TIN registry contains encrypted identity/recovery fields and public route commitments, including a versioned GPRU ElGamal scan public key. The owner-recovery record is a separate TIP-owned PDA.
- **GPRU (Guarded Privacy Routing Unit)** contains per-DNA ElGamal key derivation and proof code, a credit-transition verifier, and a Groth16 hidden-head verifier entrypoint. It does not custody TCAP assets.
- **TSN (Transfer Settlement Network)** coordinates authenticated intent/work, Node verification, Mother authorization, and exact Cranker submission.
- **TCAP (Transfer Confidential Asset Protocol)** governs approved assets and the shared replay commitment root. It is the reserve and liability protocol; the root is not a per-TIN balance account.

## Credit path currently wired in source

The checked-in TSN credit instruction `register_tcap_credit_authorization_v2` verifies the authorization and GPRU DNA-key proof, invokes GPRU's `apply_credit_transition_v1`, then invokes TCAP's `credit_gpru_memo_v1`. GPRU validates the first encrypted credit or checks later ElGamal ciphertext addition against the supplied predecessor ciphertext and verifies the commitment. TCAP validates the asset, Mother-derived authorization signer, validity window, shared-root predecessor, and next global sequence, then advances that shared root. The transaction binds the encrypted Memo instruction to the GPRU transition.

This is not a per-TIN on-chain latest-head registry. The GPRU credit verifier receives the TIP registry and TCAP shared root, but does not persist a per-TIN head. TCAP's shared root gives the wired credit path a global atomic checkpoint; it does not by itself prove that a supplied per-TIN ciphertext is the latest ciphertext. Do not describe this source path as a complete stale-balance defense.

The chain transition does not create a `TCapTinTipV1` PDA in this TSN credit instruction. TCAP still contains `TCapTinTipV1` and legacy initialize/credit/debit/exit code for other paths. Those definitions are not proof that the current TSN credit path uses them. The credit path's encrypted Memo is transaction instruction data, not a persistent balance account; reading and rebuilding a user's complete Memo history requires RPC access and an SDK/indexer flow.

## Hidden-head proof path in source

The GPRU program includes `verify_hidden_head_transition_v1` and a Mother-authorized verifier-key initializer. Its Groth16 circuit source describes private TIP-route membership, a hidden per-route-and-asset head, sequence advancement, Memo/action binding, and nullifier non-membership/insertion. The circuit exposes six public inputs: old TCAP root, new TCAP root, Memo commitment, action commitment, nullifier, and TIP route-membership root. TCAP includes `advance_gpru_hidden_head_v1`, which checks the shared-root predecessor and next global sequence, calls GPRU to verify the proof, and advances the single TCAP commitment-root account.

This path is not connected to TSN Node, SDK, Cranker, or the active TSN credit instruction. The Circom circuit has not been compiled into a proving system or validated against generated Groth16 keys/proofs in the documented workflow. No proving-key setup, proof generation pipeline, deployment initialization, end-to-end test, or chain confirmation is established here. The circuit source also does not implement encrypted balance arithmetic; the hidden-head proof and balance-transition proof are separate requirements.

## Linkability and public-data limits

The hidden-head design avoids a public per-TIN state account, but all transitions still write the same TCAP commitment-root PDA. That shared writable account is visible in every transaction using the path and serializes updates globally. This does not reveal which TIN's hidden head changed, but it creates a common protocol-level link and observable ordering. It is not zero-linkability.

In the current hidden-head instruction ABI, `action_kind`, `token_id`, and `amount` are explicit public fields and are checked against the proof arguments. Treat those values as visible unless the ABI is changed and the circuit proves the required relation without disclosing them. The Memo bytes and transaction metadata are also public on Solana even when the Memo payload is encrypted.

## Debit, exit, and settlement boundary

TCAP contains older debit and exit instructions that reference `TCapTinTipV1`; the current Node/SDK/Cranker flow does not submit the hidden-head proof path for debit or exit. The checked-in hidden-head circuit binds a generic action commitment but does not prove that an encrypted balance is sufficient, that a ciphertext is the exact subtraction, or that an exit preserves solvency. Do not describe confidential debit/exit as enabled by this proof source.

Receiver acceptance, Node verification, Cranker submission, and Solana confirmation are distinct. Confirmed reserve funding is not proof that the follow-up settlement succeeded. A chain claim requires transaction and account evidence from the target cluster.

## Canonical source pointers

- TIP Registrar: `tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/`
- GPRU program and circuit: `tsn-protocol/programs/gpru/src/` and `circuits/hidden_head_v1/`
- TSN authorization CPI: `tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization_v2.rs`
- TCAP current and hidden-head instructions: `tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/`
- SDK, Node, Receiver, and Cranker callers: `tsn-protocol/sdks/tsn-sdk/src/`, `services/tsn-node/`, `services/tsn-receiver/`, and `services/tsn-cranker-op-daemon/`

Use these contracts over historical design notes. Historical experiments and smoke-test runbooks are labeled as such and must not be treated as the current integration path.
