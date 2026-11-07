# GPRU hidden-head proof status

GPRU verifies private recipient route/head, funded-note membership and exact amount arithmetic without custody of TCAP assets. The experimental replacement uses a private-secret nullifier, freshly blinded amount commitment and immutable sealed funding root. TCAP atomically updates shared head/root and epoch transcript with no individual token movement or public liability reclassification. Complete 2–64-credit epoch proof separately authenticates one aggregate accounting total; see [the current ABI](./laboratory/credit-abi.md).

## Proof interface

The credit circuit has thirteen public inputs: old/new TCAP roots, Memo commitment, action commitment, nullifier, TIP route root, successor portfolio root, successor balance-point X/Y, encrypted blinding delta, ephemeral-point X/Y and sealed funding root. Private witness contains route/head/sequence, token/nullifier paths, ciphertext opening and exact funded-note amount/asset membership with fresh amount blinding. Pedersen arithmetic and encrypted delta remain bound. Separate epoch proof exposes seed, digest, total, count and token, opening every accepted amount commitment in order.

Public deposits/epoch totals, assets, roots, nullifiers, successor points, accounts, ciphertext and timing remain observable. Removing plaintext amount and the old deposit-signature nullifier does not establish complete unlinkability: Node knows private routes/openings, and recipient-registry/head history or known candidate amounts can still correlate payments. Positive pools require two wallet sources; addresses do not prove independent people. [Cryptography](./laboratory/cryptography.md) records the exact boundary.

## Prover and setup artifacts

The [November 7 validation](./laboratory/experiments/EXP-20261107-private-credit-epoch.md) records matching isolated development artifacts, real credit/epoch proofs and serialized native checks. SBF, matching deployed keys, live multiwallet/accounting, production ceremony and independent circuit review remain unverified. Earlier [November 2 tests/builds](./laboratory/experiments/EXP-20261102-hidden-head.md) describe their historical version. Node requires explicit matching artifacts, snapshots and the protected opening journal.

The required lifecycle is documented in [GPRU Groth16 prover and key artifacts](./GROTH16-PROVER-AND-KEY-ARTIFACTS.md): pin the circuit toolchain, compile and review the circuit, perform and verify a circuit-specific multi-party setup, generate and validate proofs, convert and commit the verification key in the Mother-authorized GPRU verifier PDA, configure a witness/prover service, and verify the complete path before enabling settlement.

## Required action scope

The GPRU circuit names credit, debit, and exit action kinds, but program/service execution has not been verified for all three. Debit and exit remain disabled until TSN authorization, TCAP affordability/liquidity/payout checks, successor arithmetic, nullifier insertion, and shared-root advancement are all enforced atomically and covered by valid proof vectors.

For full source status, see [Current architecture](./CURRENT-ARCHITECTURE.md). Do not use the historical per-TIP TCAP smoke procedures for this flow.
