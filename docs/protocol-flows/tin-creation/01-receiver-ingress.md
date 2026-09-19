# TIN Creation: Receiver Ingress

## Intended Responsibility

The Receiver should be the durable first stop for a TIN creation operation.
It should accept the SDK payload, create an idempotent `TIN_OPERATION` work
record, mark it `RECEIVED`, and wake the Node. The Receiver must not approve
the TIN, recompute the owner hash, or submit Solana transactions.

```text
Browser / SDK
    -> Receiver: authenticated durable ingress
    -> Node: verification lease
    -> Receiver: VERIFIED work
    -> Cranker: Receiver lease
    -> Solana: exact authorized instruction
```

## Receiver Work Shape

The Receiver work contract defines:

```ts
{
  id: string;
  kind: "TIN_OPERATION";
  status: "RECEIVED";
  stateVersion: number;
  payloadCommitment: string;
  payload: Record<string, unknown>;
  receivedAt: string;
  updatedAt: string;
  nodeLease: null;
  crankerLease: null;
  verification: null;
  result: null;
}
```

The `payloadCommitment` is the Receiver's idempotency fingerprint for the
submitted payload. Repeating the same operation must return the existing work;
repeating the same ID with different content must fail with an idempotency
conflict.

## What Receiver Ingress Must Accept

The TIN operation payload is the SDK-generated protocol object, including:

| Field                          | Type    | Encoding                             |
| ------------------------------ | ------- | ------------------------------------ |
| `intentType`                   | string  | `tin_creation`                       |
| `programAssigned`              | boolean | JSON boolean, true                   |
| `ownerPubkey`                  | string  | Solana base58 public key             |
| `ownerSignature`               | string  | Base64 Ed25519 signature             |
| `ownerIntentHash`              | string  | 64 lowercase hexadecimal characters  |
| `ownerIntentMessage`           | string  | Exact UTF-8 message signed by wallet |
| `nonce`                        | string  | 64 lowercase hexadecimal characters  |
| `expiry`                       | number  | Unix seconds                         |
| `displayName`                  | string  | UTF-8 text                           |
| `encryptedMasterSeed`          | string  | Standard base64 opaque envelope      |
| `encryptedMetadataHash`        | string  | 64 hexadecimal characters            |
| `pruConfigurationHash`         | string  | 64 hexadecimal characters            |
| `encryptedPublicRouteEnvelope` | string  | Empty for active TCap route          |
| `routeVersion`                 | number  | Positive integer                     |
| `routeNonce`                   | string  | 64 hexadecimal characters            |
| `tcapRouteVersion`             | number  | `1`                                  |
| `tcapRelationshipCommitment`   | string  | 64 hexadecimal characters            |
| `tcapRelationshipReference`    | string  | 64 hexadecimal characters            |
| `tcapPolicyCommitment`         | string  | 64 hexadecimal characters            |

The Receiver may validate the outer request contract and authentication, but
Node-only rules remain Node responsibilities. In particular, the Receiver must
not decide whether the owner signature, intent hash, expiry, or TCap route is
valid.

## Current Implementation Gap

The current protocol test UI does **not** yet use Receiver-first TIN ingress.
The SDK submission helper currently targets:

```text
POST http://127.0.0.1:8000/tin-operations
```

The Receiver has a proxy route:

```text
POST /api/tin-operations
```

but that route currently forwards to the Node through `proxyNode` instead of
creating a Receiver `TIN_OPERATION` work record. Therefore the successful UI
result proves:

```text
Browser -> SDK -> Node accepted intent
```

It does not yet prove:

```text
Browser -> Receiver durable work -> Node verification
```

This distinction must remain visible in status messages and documentation.

## Required Wiring Change

To implement Receiver-first TIN creation:

1. Add an authenticated Receiver ingress handler for `TIN_OPERATION`.
2. Allow only the documented TIN operation fields.
3. Create durable work with `kind: "TIN_OPERATION"` and `status: "RECEIVED"`.
4. Generate the idempotent `payloadCommitment`.
5. Return a public work view and work ID; do not return private payload fields
   to unauthenticated callers.
6. Wake the Node with a control-only notification after the Firestore write.
7. Have the Node lease `/api/internal/node/work` with `TIN_OPERATION` support.
8. Have the Node verify the leased payload and PATCH the Receiver to
   `VERIFIED` or `REJECTED`.
9. Have the Cranker lease only `VERIFIED` TIN work through
   `POST /api/cranker/work`.
10. Have the Cranker report `CONFIRMED` or `FAILED` through
    `PATCH /api/cranker/work`.

The wake notification must contain no TIN payload, encrypted envelope, owner
signature, or private identity data. It is only a hint that durable work is
available; the Node must re-read the work through its authenticated Receiver
API.

## Acceptance Evidence

This stage is complete only when all of the following are observable:

```text
Receiver receives TIN_OPERATION: yes
Receiver creates RECEIVED work ID: yes
Node is woken after durable write: yes
Node leases RECEIVED work: yes
Node returns VERIFIED work to Receiver: yes
Cranker leases VERIFIED work from Receiver: pending
```

The current UI's returned `intentId` is not sufficient evidence for this stage.
The next implementation document is
[Node verification](02-node-verification.md), but it should be finalized only
after Receiver ingress is actually wired.
