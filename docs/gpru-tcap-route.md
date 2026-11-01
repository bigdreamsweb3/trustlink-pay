# GPRU hidden-head proof status

GPRU guards the integrity and privacy of the user's private state presented to TCAP: its hidden-head V1 proof is designed to establish that the hidden TIP route and asset head are current and that the proposed balance transition follows from that state, while binding the update to a Memo and inserting a one-time nullifier. TCAP governs the funds and atomically updates one shared root with settlement liabilities. No per-TIN TCAP tip account is part of this proof ABI. This proof path is not operational end to end yet, and public fields plus the shared root can still reveal activity and correlation.

## Proof interface

The Groth16 circuit declares twelve public inputs in this order: old TCAP root, new TCAP root, Memo commitment, action commitment, nullifier, TIP route root, successor portfolio root, successor balance-point X/Y, encrypted blinding delta, and its ephemeral-point X/Y. The witness hides route membership, the one-per-TIN outer head/sequence, the nested token-map path, prior nullifier state, and the ciphertext opening. Balance arithmetic uses Pedersen commitments; the circuit proves the one-time Memo ciphertext contains the exact blinding delta used in that transition. R1CS generation has succeeded, but independent review, setup, witness generation, and proof verification remain outstanding.

The public interface still reveals action kind, asset/token ID, amount, nullifier, both shared roots, the Memo commitment, TIP route root, and the successor point. All transitions write the same public TCAP root and expose global ordering; the design is not zero-linkability.

## Prover and setup artifacts

Production proving keys, a matching verifying-key artifact, setup transcript, validated verifying-key converter, witness provider, or prover service are not currently available in the repository. Node settlement authorization returns `GPRU_GROTH16_PROVER_NOT_CONFIGURED`, so the service refuses to emit an authorization without the proof. The current TSNP/TCAP source ABI carries the proof and GPRU verifier CPI, but that does not make settlement operational.

The required lifecycle is documented in [GPRU Groth16 prover and key artifacts](./GROTH16-PROVER-AND-KEY-ARTIFACTS.md): pin the circuit toolchain, compile and review the circuit, perform and verify a circuit-specific multi-party setup, generate and validate proofs, convert and commit the verification key in the Mother-authorized GPRU verifier PDA, configure a witness/prover service, and verify the complete path before enabling settlement.

## Required action scope

The GPRU circuit names credit, debit, and exit action kinds, but program/service execution has not been verified for all three. Debit and exit remain disabled until TSN authorization, TCAP affordability/liquidity/payout checks, successor arithmetic, nullifier insertion, and shared-root advancement are all enforced atomically and covered by valid proof vectors.

For full source status, see [Current architecture](./CURRENT-ARCHITECTURE.md). Do not use the historical per-TIP TCAP smoke procedures for this flow.
