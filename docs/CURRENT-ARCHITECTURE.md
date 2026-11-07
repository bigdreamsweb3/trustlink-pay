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

GPRU verifies the private route/head and funded-note amount transition; TCAP retains custody and applies the accepted root/transcript change. Current experimental credit uses a private-secret nullifier and fresh blinded amount commitment, removing the old deposit-signature formula and plaintext credit amount. Public deposits/epoch totals, roots, points, accounts, ciphertext and timing can still correlate payments; Node knows private routes/openings, and recipient-registry/head linkage remains unresolved. See [the canonical privacy record](./laboratory/cryptography.md).

## Hidden-head credit ABI in source

TSNP `tsn_register_tcap_credit_authorization_v3` calls TCAP `credit_gpru_memo_v2`, which checks approved asset, Mother-derived signer, slots, released sealed pool, current root/sequence/epoch and reserve solvency before GPRU `verify_hidden_head_transition_v2`. Only accepted proof advances the shared head/nullifier root and blinded epoch transcript. The reserve is readonly; no tokens move or liabilities reclassify on individual credit. The [credit ABI](./laboratory/credit-abi.md) records the 905-byte call and sixteen accounts.

GPRU validates canonical TIP/TCAP roots, released sealed funding root, approved top-level TSNP caller, circuit/key and the following proof-bound Memo. Thirteen public inputs bind old/new roots, Memo/action commitment, nullifier, TIP root, successor portfolio/point, encrypted blinding delta, ephemeral point and sealed funding root. Private witnesses include route/head/sequence, nested token and nullifier paths, funded-note membership/secret, exact positive amount and fresh amount blinding. Pedersen arithmetic and one-time delta ciphertext remain proof-bound; the owner-encrypted V2 action carries its amount opening, which SDK recovery verifies against the public commitment.

The [November 7 experiment](./laboratory/experiments/EXP-20261107-private-credit-epoch.md) records matching isolated development artifacts, real credit/epoch proofs, serialized native verification and cross-layer tests. SBF could not start because WSL VM startup failed; matching deployment, explicit credit rekey, separate epoch enrollment and live accounting remain unverified. The [November 2 readiness record](./laboratory/experiments/EXP-20261102-hidden-head.md) preserves its earlier circuit/proof/SBF observations as historical evidence. Missing prover settings or matching snapshots still fail preparation.

## TCAP state and Memo records

TCAP uses a shared authenticated head/nullifier root and asset-specific blinded credit epoch, while DBrix Memo remains transaction instruction data. Its prefix binds successor portfolio/point, action and encrypted delta; its owner-encrypted body carries the recoverable action/opening. SDK decrypts and validates history, whose completeness depends on the scanner/indexer. Node proves all 2–64 ordered epoch openings; Receiver coordinates TCAP_EPOCH_ACCOUNTING work and Cranker submits one authenticated pending-to-settled reclassification. Total obligations, custody backing and uncredited pending deposits remain unchanged; singleton epochs carry forward. Native credit epochs are distinct from retained TSNP Epoch Treasury/payout APIs.

## Privacy and public-data limits

Every credit writes the shared TCAP root, exposing protocol participation and global ordering. Its public fields include token, blinded amount commitment, nullifier, roots, points and ciphertext; note commitment/opening and plaintext TIN/predecessor are absent. Sealed-pool capture requires two positive unspent notes and two wallet sources, which do not prove independent people. Common adaptive release windows preserve that floor, but credits still follow serialized queue order. Larger pools do not by themselves establish unlinkability against known amounts, prior spends or timing.

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
