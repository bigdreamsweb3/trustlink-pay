# Protocol Flows

This folder is the canonical documentation home for end-to-end TSN and TIN
processes. Each flow explains how data changes as it crosses a protocol
boundary, which component owns the next decision, what is validated, and what
evidence proves the stage completed.

## Documentation Rule

Document every flow as a sequence of stages:

```text
Input -> SDK construction -> encoding -> signature -> service validation
-> stored operation -> lease -> transaction construction -> on-chain result
-> reported final state
```

For every stage, record:

- the component that acts;
- the input field names and data types;
- byte encodings such as UTF-8, hex, base64, or base64url;
- hashes and the exact bytes covered by each hash;
- signatures and the exact message bytes signed;
- accepted and rejected conditions;
- the output passed to the next component;
- the evidence proving completion.

Do not describe a request as complete merely because it passed one service.
A Node-accepted operation is still pending until the Cranker transaction is
confirmed and the resulting Solana account is decoded.

## Current Flow Map

### TIN Creation

| Stage                              | Document                                                     | Completion evidence                          |
| ---------------------------------- | ------------------------------------------------------------ | -------------------------------------------- |
| Browser -> SDK -> Receiver ingress | [01 Receiver ingress](tin-creation/01-receiver-ingress.md)   | Receiver stores `RECEIVED` work              |
| Receiver -> Node verification      | [02 Node verification](tin-creation/02-node-verification.md) | Node returns verified work to Receiver       |
| Receiver -> Cranker lease          | Pending: `tin-creation/03-cranker-lease.md`                  | Cranker owns a valid lease                   |
| Cranker -> Solana                  | Pending: `tin-creation/04-onchain-finalization.md`           | Confirmed transaction and identity PDA       |
| Final state and evidence           | Pending: `tin-creation/05-evidence.md`                       | Assigned 10-digit TIN and explorer signature |

The current handoff document contains the complete browser-to-Node contract and
identifies the remaining owner-proof compatibility decision before Cranker
execution. It documents the path that currently works, not yet the desired
Receiver-first production path.

### Current TIN creation exception

The protocol test UI currently submits TIN creation directly to the Node's
`POST /tin-operations` endpoint. This is why the UI can receive an `intentId`
without a Receiver work ID.

The Receiver already has the concepts needed for the intended path:

```text
TIN_OPERATION -> RECEIVED -> NODE_VERIFYING -> VERIFIED -> CRANKER_LEASED
```

However, the TIN creation UI and SDK submission route must be changed to post to
the Receiver's authenticated `tin-operations` proxy first. Until that wiring
is implemented, do not document Node acceptance as Receiver acceptance.

## Recommended Files

Create one folder or document per lifecycle, not one giant document for every
service:

```text
protocol-flows/
  README.md
  tin-creation/
    01-receiver-ingress.md
    02-node-verification.md
    03-cranker-lease.md
    04-onchain-finalization.md
    05-evidence.md
  tin-payment/
  settlement/
```

The existing top-level handoff is kept as the first accepted artifact. New
stage documents should link back to it and should not copy protocol constants
into multiple places without identifying the owning source file.

## Evidence Standard

Use these completion labels consistently:

- `constructed`: the SDK created a local payload;
- `signed`: the wallet or operator signed the specified bytes;
- `accepted`: the receiving service validated and stored the operation;
- `leased`: a Cranker acquired an authorized unit of work;
- `submitted`: a transaction was sent to Solana;
- `confirmed`: Solana finalized the transaction;
- `decoded`: the resulting account was read and interpreted;
- `complete`: the expected user-visible state was verified.

Screenshots and demo logs belong in `docs/expo/`. Normative data contracts and
lifecycle explanations belong here. Commands, test gates, and repeatable
verification procedures belong in `docs/team/testing/` or
`docs/team/operations/`.

## Source Of Truth

When documentation conflicts with code, verify these owners first:

- SDK payload and hash construction: `tsn-protocol/sdks/tsn-sdk/src/`;
- Node normalization and validation: `tsn-protocol/services/tsn-node/`;
- Cranker lease and transaction construction:
  `tsn-protocol/services/tsn-cranker-op-daemon/`;
- account state transition:
  `tsn-protocol/programs/transfer-identity-protocol/`;
- observed transaction evidence: `docs/expo/` and `docs/team/testing/`.
