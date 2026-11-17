# TrustLink architecture and invention source brief

**Status: CURRENT, reconciled 2026-11-02.** Use this brief to structure technical explanations, not to authorize implementation or claim production readiness. [Terminology](architecture-terminology.md) owns names; [Laboratory architecture](../docs/laboratory/architecture-map.md), [components](../docs/laboratory/components.md), [credit ABI](../docs/laboratory/credit-abi.md) and [cryptography](../docs/laboratory/cryptography.md) own detailed source-bound knowledge. Follow the [change policy](architecture-change-policy.md) before protocol edits and the [maintenance manual](../docs/DOCUMENTATION_MAINTENANCE.md) for documentation.

## Defensible current system statement

TSN combines identity addressing, off-chain verification/coordination and Solana authorization/settlement enforcement. TIP owns TIN registration and route membership; Receiver coordinates durable work; Node verifies signed funding and prepares the root-matching hidden-head transition; Cranker submits permitted transactions. Mother authority co-signs settlement through TSNP; TCAP validates assets/reserves and calls GPRU before atomically advancing its shared root/epoch transcript and later verifying aggregate liability accounting. Solana supplies execution, ordering and finality. Native credit changes confidential state rather than paying a recipient wallet.

Describe authorization, routing, privacy, submission and settlement as separate responsibilities. Receiver pre-creates settlement work at ingress, but its verification requires confirmed linked funding. The sender-signed deposit is submitted unchanged. A second independently verified, lease-bound settlement uses TSNP → TCAP → GPRU and a bound Memo. Epoch Treasury, AcceptedIntent, Settlement DNA, private payout/refund and reimbursement are a separate retained family, not stages in this credit flow.

## Current cryptographic contract

The checked-in circuit uses BN254 Groth16, Poseidon authenticated maps and BabyJubjub balance/delta relations. Current funded-note credit has thirteen public inputs and fourteen verifier IC points. It proves funded membership, exact registered asset/amount and a private-secret nullifier; the note/leaf/index/opening stay out of the public credit statement. Current TIP version-1 creation authenticates the scan public point. The existing ciphertext relation still binds the recoverable delta to the Pedersen transition, and GPRU binds the Memo prefix/full bytes. The owner SDK validates and reconstructs history. Source/local proof results, root/key migration and live execution are separate evidence categories.

Root-selected witness and local prover adapters now exist in Node. The November 2 [development-setup experiment](../docs/laboratory/experiments/EXP-20261102-hidden-head.md) records fresh source/R1CS/WASM matching and development-key checks; it supersedes the earlier absent-prover/eight-input checkpoint. Old eight-input keys are incompatible. A Node still fails closed when matching snapshots, key artifacts, initialized verifier/roots or transport prerequisites are unavailable. Development setup is neither a production ceremony nor a security audit, and local checks do not establish a complete on-chain credit.

The earlier Ristretto encrypted-portfolio/single-envelope proposal remains [historical/proposed context](gpru-unlinkable-latest-head.md). It is not the current proof-bound credit record. Retained portfolio/key/debit/exit APIs need exact caller/proof/account review before describing their runtime capability; do not generalize credit evidence to them.

## Material disclosure and unresolved engineering direction

The privacy target is confidential TIN activity and unlinkability between TCAP actions for public observers. Public wallet funding in the mobile-money experience is an accepted boundary, and Node is intentionally trusted with openings/routes. Do not invent a requirement for secrecy against that authorized Node or promise absolute wallet anonymity from using a TIN.

The experimental private-credit replacement uses funded-note secret-derived nullifiers, authenticated funded-note membership through the existing global funding account and freshly blinded amount commitments. Individual credit exposes no plaintext amount or amount-sized liability delta; complete epoch accounting separately publishes a 2–64-credit total. The [November 16 checkpoint](../docs/laboratory/experiments/EXP-20261116-private-credit-epoch.md) verifies two credits and accounting on chain. Public history can still narrow funding candidates, current persistent TIP route/head material permits scoped registry correlations, and TIP registration publicly binds the registry to its authorization wallet. Retained exit publishes its destination; private transfer/exit unlinkability and complete owner recovery require separate verification. November 2–5 public disclosures are historical and cannot be removed from chain.

Record this discrepancy in the [reconciliation register](../docs/laboratory/reconciliation-register.md). Do not invent a replacement nullifier, claim zero correlation, or add a compatibility path. Any proposed privacy change must first specify replay, funding authorization, root updates, proof relations and all participating contracts. Likewise, generalized debit/exit delivery, schema-2→3 migration, complete owner scanning and external-route reachability remain independently unverified unless fresh evidence establishes them.

## Technology and external integration scope

Use [technology reference](../docs/laboratory/technology-reference.md) for actual Rust/Anchor/Solana, TypeScript SDK/Cranker, Python Node, Firestore Receiver, Circom/snarkjs, DBrix and Mintlify roles/versions. Dependency presence does not prove a wired capability. Preserve the distinction between direct/staged private TIN issuance and old allocator/UI restrictions.

The earlier Dial on Arc context names the application and “Pay a number, not a wallet” tagline, with an Arc Testnet CCTP deposit router. Its Node-to-Solana mint/TCAP credit was not built or tested in that supplied project context. Recheck external code/deployment before making current claims; do not describe mainnet use or real USDC delivery from that historical description.

## Required structure for a technical claim

For each claimed separation, identify the data, its actual enforcing instruction/account/proof/service check, a concrete failure or disclosure, and a falsifiable test with expected result. Label source, test, build, deployment and transaction evidence separately and state configuration gates beside capabilities. Unknown approvals, alternatives and guarantees remain unknown. Link canonical details rather than restating them across documents; preserve valuable historical observations with their dates and current-reference boundary.
