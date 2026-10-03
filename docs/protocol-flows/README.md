# Protocol Flows

This folder is the canonical documentation home for end-to-end TSN and TIN
processes. Each flow explains how data changes as it crosses a protocol
boundary, which component owns the next decision, what is validated, and what
evidence proves the stage completed.

## Documentation Rule

The Receiver-first lease boundary is documented in
[receiver-node-cranker-lease.md](receiver-node-cranker-lease.md).

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
| Receiver -> Cranker lease          | [03 Cranker lease](tin-creation/03-cranker-lease.md)          | Cranker owns a valid lease                   |
| Cranker -> Solana                  | [04 On-chain finalization](tin-creation/04-onchain-finalization.md) | Confirmed transaction and identity PDA  |
| Final state and evidence           | [05 Evidence](tin-creation/05-evidence.md)                    | Confirmed operation and decoded TIN V1 account |

The TIN V1 flow is wired through Receiver ingress, Node verification, Cranker
submission, and the staged on-chain creation path. The individual stage guides
are the operational source of truth; older direct-Node and program-assigned
descriptions elsewhere in the repository are historical and must not be used
for new TIN issuance.

### Receiver-first ingress and retained payloads

The TSN XP uses the SDK to submit owner-authorized TIN work to the Receiver.
Only the Node's authenticated worker leases it for verification; the browser
does not submit directly to the Node. The Receiver work states are:

```text
TIN_OPERATION -> RECEIVED -> NODE_VERIFYING -> VERIFIED -> CRANKER_LEASED
```

For Node-verified work, the Receiver stores the durable ingress payload once and
records a verification delta plus a signed Node attestation. The attestation
binds the decision to the work ID/kind, ingress commitment, verification
evidence commitment, execution-payload commitment, and active Node lease. The
Receiver checks the signature before accepting the decision; the Cranker checks
it again against the exact execution payload before submission. The Cranker
projection reconstructs the verified view from the payload and delta. Local
JSON records using the legacy duplicated shape are compacted when the Receiver
storage module loads.

For private TIN creation, the display name and TIN travel inside the encrypted
identity envelope. Receiver work and the on-chain account contain ciphertext,
not the plaintext TIN or display name. After finality, the XP can resolve the
identity with the namespace lookup value. The universal value is public; an
institutional issuer may keep its own value private. The current UI presents the TIN in
the issuing browser session; reconnecting a wallet does not yet perform a
wallet-to-TIN reverse lookup, because the registry intentionally does not
expose an owner-to-TIN recovery index. Universal identity records are
enumerable by design; this does not grant transaction monitoring access.

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
