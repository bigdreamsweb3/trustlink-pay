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

## What replaced it

The current production architecture is:

```text
TIN → privacy-receiving root → GPRU → TSN Epoch Treasury / Mother
→ TCAP ConfidentialSettlement credit → encrypted snapshot
```

GPRU is non-custodial authorization/routing only. TCAP owns the commitment-
backed tip and credit transition; private balances live in encrypted snapshots
read by the owner device.

## Implementation rule

Implementers must not target ZK-PRU for new receiving, spending, balance,
settlement, SDK or integration work. Any remaining ZK-PRU code, documentation,
or account path is historical compatibility material and must be assessed as
residual/legacy before it can be reached. It is not part of the live TIN,
GPRU, TSN or TCAP path.

Live confidential debit and exit remain separately proof-gated and disabled;
retiring ZK-PRU does not enable spending.
