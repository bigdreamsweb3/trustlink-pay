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

## Current TIN V1 Payload

The XP backend generates the random TIN and uses the shared protected lookup
secret to derive the lookup commitment and identity envelope. The TIN and
display name stay out of this Receiver payload. `TinV1Account` does not assign
the TIN; it initializes the commitment-derived registry account after the
Cranker submits the signed `CreateTinV1` instruction.

Receiver ingress accepts the SDK-generated object with these fields:

| Field                          | Type    | Encoding                             |
| ------------------------------ | ------- | ------------------------------------ |
| `intentType`                   | string  | `tin_creation`                       |
| `programAssigned`              | boolean | JSON boolean, false                  |
| `intentId`                     | string  | XP-generated operation UUID          |
| `ownerPubkey`                  | string  | Solana base58 public key             |
| `ownerSignature`               | string  | Base64 Ed25519 signature over raw 32-byte intent hash |
| `ownerIntentHash`              | string  | 64 lowercase hexadecimal characters  |
| `ownerIntentMessage`           | string  | Canonical display text; not the signed bytes |
| `nonce`                        | string  | Same 32-byte value as `routeNonce`   |
| `expiry`                       | number  | Unix seconds                         |
| `lookupCommitment`             | string  | 64 lowercase hexadecimal characters  |
| `lookupIssuanceProof`          | string  | 32-byte HMAC hex; contains no secret |
| `encryptedIdentityEnvelope`    | string  | Standard base64 AES-GCM envelope     |
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

The Receiver allowlists this schema and stores the encrypted identity and
commitment with the work. It must not store or accept the plaintext TIN,
display name, or `TINS_LOOKUP_SECRET`. Node verification checks the
length-prefixed intent hash, raw Ed25519 signature, expiry, TCap commitments,
and HMAC issuance proof; the Receiver does not make those protocol decisions.

## Current Wiring

The Dapp calls the SDK submission helper with the selected Receiver ingress:

```text
POST {receiverUrl}/tin-operations
```

For local development, the standard `npm run protocol-tests:ui` command loads
`protocol-tests/ui/.env.local` and selects `http://127.0.0.1:8010`. Run
`npm run protocol-tests:ui:live` only when intentionally targeting the live
Receiver. Network status probes and transaction submission must use the same
selected environment.

The Receiver accepts the documented private TIN V1 payload, creates durable
work with `kind: "TIN_OPERATION"` and `status: "RECEIVED"`, commits an
idempotency fingerprint, and sends a payload-free Node wake after persistence.
The Node re-reads and verifies the work through its authenticated Receiver API;
only `VERIFIED` work is available to an authorized Cranker.

Receiver ingress acceptance proves only that the signed intent was durably
queued. It does not prove Node verification, Cranker submission, or Solana
finalization; each stage needs its own evidence.

## Remaining Evidence

This stage is evidenced only when the local run shows:

```text
Receiver receives TIN_OPERATION: yes
Receiver creates RECEIVED work ID: yes
Node leases and verifies the work: yes
Cranker leases VERIFIED work: pending
Solana CreateTin transaction finalizes: pending
```

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

The Receiver's `operationId` is the work reference for status polling. The
owner-intent `intentId` is separate and binds the Node operation lifecycle.
Neither identifier proves Solana finalization.
