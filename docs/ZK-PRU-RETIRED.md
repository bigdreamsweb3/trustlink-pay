# ZK-PRU retired architecture

ZK-PRU was an earlier TrustLink experiment for deriving protected receiving
units and scoped spending authorities from wallet-owned private material. It
helped explore privacy-preserving routes, child authorities and commitment
based settlement.

## Why it was retired

The model created unnecessary receiving-unit and spending complexity around the
payment identity. It also encouraged readers and integrators to treat PRUs as
funded balance containers or as the normal receiving architecture. That is no
longer the intended authority or accounting boundary.

## Current protocol boundaries

The earlier ZK-PRU model is retired. TIP manages transfer identity and route metadata; GPRU is a separate Solana program for one-time DNA-key verification and Groth16 hidden-head proofs. TSN coordinates authorized work, while TCAP governs approved assets, reserves, and the shared commitment root. The TSNP/TCAP credit ABI carries the hidden-head proof, but Node currently fails closed because no prover, witness source, or trusted setup artifacts are configured. Source code does not prove that the latest revision is deployed or that a Devnet payment succeeded. Debit/exit are not established end to end. See [Current architecture](./CURRENT-ARCHITECTURE.md) and [GPRU Groth16 prover and key artifacts](./GROTH16-PROVER-AND-KEY-ARTIFACTS.md).
