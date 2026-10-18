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

The earlier ZK-PRU model is retired. TIP manages transfer identity and route metadata; GPRU is a separate protocol design for unique transaction DNA and proof-verified confidential state changes. TSN coordinates and verifies work, while TCAP governs approved assets, reserves, and liability accounting. The GPRU derivation primitive exists in source, but the deployable GPRU program and atomic TCAP integration are not deployed. Current TCAP instructions define live behavior; confidential debit and exit remain disabled.
