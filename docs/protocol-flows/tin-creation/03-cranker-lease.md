# TIN Creation: Receiver to Node to Cranker

## Responsibility Boundary

The Receiver owns durable work and leases. The Node validates the payload it
leases from the Receiver. The Cranker acts only after the Receiver stores the
Node's `VERIFIED` transition.

```text
Browser / SDK -> Receiver ingress -> Firebase RECEIVED
Receiver -> Node authenticated wake (no payload)
Node -> Receiver NODE_VERIFYING lease -> VERIFIED or REJECTED
Cranker -> Receiver CRANKER_LEASED verified work -> Solana CreateTin
```

## 1. Receiver Creates Durable Work

**Endpoint:** `POST /tin-operations`

The SDK sends the TIN operation fields defined in
[01-receiver-ingress.md](tin-creation/01-receiver-ingress.md). The Receiver
authenticates the request, accepts only `TIN_OPERATION`, computes
`payloadCommitment = SHA-256(canonical JSON payload)`, and stores:

```json
{
  "id": "tin-operation-id",
  "kind": "TIN_OPERATION",
  "status": "RECEIVED",
  "stateVersion": 1,
  "payloadCommitment": "64 lowercase hex characters",
  "payload": "the SDK operation object",
  "nodeLease": null,
  "crankerLease": null,
  "verification": null,
  "result": null
}
```

After Firebase commits, the Receiver sends a control-only wake. The wake has
no payload, owner signature, encrypted seed, TIN, or route data.

## 2. Node Leases the Receiver Record

**Endpoint:** `POST /api/internal/node/work`

The Node authenticates with its service credential and sends:

```json
{"nodeId":"tsn-node-local","supportedKinds":["TIN_OPERATION"]}
```

The Receiver transaction selects compatible `RECEIVED` work, writes the lease
owner and expiry, increments `stateVersion`, and returns the payload only to
the authenticated Node:

```text
RECEIVED -> NODE_VERIFYING
```

The browser never receives this response. Direct browser submission to the
Node's legacy `/tin-operations` endpoint is rejected without the internal key.

## 3. Node Verifies the Leased Payload

The Node validates the exact payload returned by the Receiver. It normalizes
fields, checks base58/base64/hex encodings, verifies the owner signature,
rebuilds the owner intent hash from protocol-defined bytes, checks expiry and
route commitments, and applies nonce and duplicate-intent replay protection.
It does not assign a TIN or submit Solana instructions.

For local development, `TSN_LOCAL_FLOW_LOGS=1` prints the leased work ID,
kind, state version, and payload commitment. Hosted Nodes keep this trace
disabled.

## 4. Node Returns the Decision

**Endpoint:** `PATCH /api/internal/node/work`

The Node sends the work ID, lease owner, expected state version, and
`VERIFIED` or `REJECTED` decision:

```json
{
  "id":"tin-operation-id",
  "owner":"tsn-node-local",
  "expectedVersion":2,
  "status":"VERIFIED",
  "evidence":{"verificationType":"TSN_TIN_OPERATION"}
}
```

The Receiver accepts this only when lease owner, expiry, and state version
match. It clears the Node lease, increments `stateVersion`, stores the
verification evidence, and makes verified work available:

```text
NODE_VERIFYING -> VERIFIED
```

## 5. Cranker Leases Verified Work

The Cranker authenticates to the Receiver and requests `TIN_OPERATION` work.
The Receiver selects only `VERIFIED` records and atomically changes:

```text
VERIFIED -> CRANKER_LEASED
```

The Cranker receives the verified public work view needed to construct the
program instruction. It does not receive Node service credentials or private
route material.

## 6. Solana Submission and Result

The Cranker constructs and submits the exact `CreateTin` instruction, then
reports the signature and confirmation result to the Receiver. The Receiver
stores `SUBMITTED` or `CONFIRMED` as the next operation state.

## Acceptance Evidence

```text
Receiver durable record: RECEIVED
Node lease: NODE_VERIFYING
Node decision: VERIFIED or REJECTED
Receiver verification evidence: stored
Cranker lease: CRANKER_LEASED only after VERIFIED
Solana result: signature and confirmation report
```
