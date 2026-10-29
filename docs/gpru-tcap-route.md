# GPRU hidden-head proof status

GPRU's hidden-head V1 source is designed to prove that a private TIP route and asset head are current, update that head, bind the update to a Memo, and insert a one-time nullifier. TCAP owns the reserve and atomically updates one shared root with the settlement liabilities. No per-TIN TCAP tip account is part of this proof ABI.

## Proof interface

The Groth16 circuit declares eight public inputs in this order: old TCAP root, new TCAP root, Memo commitment, action commitment, nullifier, TIP route root, successor balance-point X, and successor balance-point Y. The witness hides route membership, the per-TIN-and-asset head/sequence, sparse-map paths, and the prior nullifier state. The circuit source contains credit Pedersen-point addition and debit/exit balance-opening constraints, but those constraints have not passed circuit compilation or independent review.

The public interface still reveals action kind, asset/token ID, amount, nullifier, both shared roots, the Memo commitment, TIP route root, and the successor point. All transitions write the same public TCAP root and expose global ordering; the design is not zero-linkability.

## Prover and setup artifacts

No compiled R1CS/WASM, production proving key, matching verifying-key artifact, setup transcript, validated verifying-key converter, witness provider, or prover service is currently available in the repository. Node settlement authorization returns `GPRU_GROTH16_PROVER_NOT_CONFIGURED`, so the service refuses to emit an authorization without the proof. The current TSN/TCAP source ABI carries the proof and GPRU verifier CPI, but that does not make settlement operational.

The required lifecycle is documented in [GPRU Groth16 prover and key artifacts](./GROTH16-PROVER-AND-KEY-ARTIFACTS.md): pin the circuit toolchain, compile and review the circuit, perform and verify a circuit-specific multi-party setup, generate and validate proofs, convert and commit the verification key in the Mother-authorized GPRU verifier PDA, configure a witness/prover service, and verify the complete path before enabling settlement.

## Required action scope

The GPRU circuit names credit, debit, and exit action kinds, but program/service execution has not been verified for all three. Debit and exit remain disabled until TSN authorization, TCAP affordability/liquidity/payout checks, successor arithmetic, nullifier insertion, and shared-root advancement are all enforced atomically and covered by valid proof vectors.

For full source status, see [Current architecture](./CURRENT-ARCHITECTURE.md). Do not use the historical per-TIP TCAP smoke procedures for this flow.
