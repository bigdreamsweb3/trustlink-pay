# TIN Creation: Node Verification

## Why This Is a Separate Stage

TIN creation needs a separate Node verification document because the Node is the
only service that decides whether the received TIN operation is protocol-valid.
The Receiver stores and leases work. The Cranker executes verified work. Neither
may perform the Node's validation decisions.

There is currently one shared Node background worker,
`receiver_verification_worker`, for multiple work kinds. That is a shared job
loop, not a shared validation rule:

```text
shared worker loop
  -> AUTHORIZED_FUNDING verification branch
  -> TIN_OPERATION verification branch
```

TIN creation does not need a second daemon process. It needs a distinct,
testable `TIN_OPERATION` verification branch with its own contract and evidence.

## Intended Runtime Position

```text
Receiver: RECEIVED
    |
    | leaseForNode(nodeId, ["TIN_OPERATION"])
    v
Node: NODE_VERIFYING
    |
    | _verify_receiver_work(kind == "TIN_OPERATION")
    v
Node: VERIFIED or REJECTED
    |
    | PATCH /api/internal/node/work
    v
Receiver: VERIFIED -> available to Cranker
```

The Node's internal Receiver API is:

```text
POST /api/internal/node/work
PATCH /api/internal/node/work
```

Both calls use the Node service API key. The Node receives work from the
Receiver; a Cranker must not call this Node verification endpoint.

## Node-Only Responsibilities

Only the Node should:

- decode and normalize the TIN operation fields;
- validate Solana public-key encoding;
- validate fixed-size hex fields;
- decode base64 ciphertext and signatures;
- rebuild the intent hash from the exact byte sequence;
- verify the owner signature against the exact `ownerIntentMessage` bytes;
- enforce expiry and route-version rules;
- enforce nonce replay protection atomically;
- reject duplicate active creation intents;
- write the verified evidence back to the Receiver;
- expose only the verified payload permitted to the Cranker.

The Node must not:

- generate or decrypt the owner's master seed;
- change the display name, owner, encrypted envelope, route, or hash;
- assign the TIN number;
- submit the Solana transaction;
- let a Cranker bypass verification;
- turn a readable public view into private identity access.

## Verification Input

The Receiver provides the Node with a `TIN_OPERATION` payload. For the current
program-assigned route, the important fields are:

| Field                          | Required type | Node validation                                     |
| ------------------------------ | ------------- | --------------------------------------------------- |
| `intentType`                   | string        | Must be `tin_creation`                              |
| `programAssigned`              | boolean       | Must be `true` for this route                       |
| `ownerPubkey`                  | base58 string | Must decode to 32 bytes and a valid Solana key      |
| `ownerSignature`               | base64 string | Must decode to 64 Ed25519 bytes                     |
| `ownerIntentHash`              | hex string    | Must decode to exactly 32 bytes                     |
| `ownerIntentMessage`           | UTF-8 string  | Must be the exact SDK display message when supplied |
| `nonce`                        | hex string    | Must decode to exactly 32 bytes                     |
| `expiry`                       | integer       | Must be a future Unix timestamp in seconds          |
| `displayName`                  | UTF-8 string  | Must be non-empty and protocol-valid                |
| `encryptedMasterSeed`          | base64 string | Must decode to non-empty opaque bytes               |
| `encryptedMetadataHash`        | hex string    | Must decode to 32 bytes                             |
| `pruConfigurationHash`         | hex string    | Must decode to 32 bytes; zero for active TCap route |
| `encryptedPublicRouteEnvelope` | base64 string | Empty for the active TCap route                     |
| `routeVersion`                 | integer       | Must be positive                                    |
| `routeNonce`                   | hex string    | Must decode to 32 bytes                             |
| `tcapRouteVersion`             | integer       | Must be `1` for the active TCap route               |
| relationship commitments       | hex strings   | Each must decode to 32 bytes and be non-zero        |

The Node does not hash the JSON string. It hashes decoded and normalized bytes.

## Verification Sequence

### 1. Lease the Receiver work

The Node calls the Receiver's authenticated internal endpoint with:

```json
{
  "nodeId": "tsn-node-local",
  "supportedKinds": ["AUTHORIZED_FUNDING", "TIN_OPERATION"]
}
```

The Receiver atomically changes:

```text
RECEIVED -> NODE_VERIFYING
```

and attaches a short `nodeLease` with an owner, expiry, lease ID, and state
version.

### 2. Normalize the payload

The Node maps accepted camelCase and internal field names into one normalized
operation. It rejects missing or malformed values before any operation is
stored as verified.

Examples:

```text
ownerPubkey       base58 -> 32 raw bytes
ownerIntentHash   64 hex -> 32 raw bytes
nonce             64 hex -> 32 raw bytes
ownerSignature    base64 -> 64 raw bytes
encryptedMasterSeed base64 -> opaque raw bytes
routeVersion      JSON number -> positive integer
expiry            JSON number -> Unix seconds
```

### 3. Recompute the owner intent hash

For `programAssigned == true`, the Node computes:

```text
SHA-256(
  UTF-8("TINS_CREATE_INTENT_V1") ||
  ownerPubkey[32] ||
  UTF-8(displayName) ||
  encryptedMasterSeed ||
  encryptedMetadataHash[32] ||
  pruConfigurationHash[32] ||
  encryptedPublicRouteEnvelope ||
  routeVersion[8] little-endian ||
  routeNonce[32] ||
  tcapRouteVersion[1] ||
  tcapRelationshipCommitment[32] ||
  tcapRelationshipReference[32] ||
  tcapPolicyCommitment[32] ||
  nonce[32] ||
  expiry[8] signed little-endian
)
```

The result must equal the submitted `ownerIntentHash`. A change to any field,
including one byte of encrypted data, produces a different hash.

### 4. Verify the owner signature

The Node verifies the 64-byte Ed25519 signature against the exact UTF-8 bytes of
`ownerIntentMessage` when that message is supplied. The message must be the
same SDK-generated message that the wallet displayed and signed.

This prevents a signature over one message from being attached to a different
intent hash or payload.

The signed message and the hash have different jobs:

| Value                | Purpose                                                             |
| -------------------- | ------------------------------------------------------------------- |
| `ownerIntentMessage` | Human-readable wallet approval bytes                                |
| `ownerIntentHash`    | Compact commitment to the complete binary operation                 |
| `ownerSignature`     | Owner proof over the readable approval message at the Node boundary |

The Cranker/on-chain proof must use a protocol-consistent message rule. See the
Cranker handoff gap in the parent handoff document before enabling execution.

### 5. Enforce replay and uniqueness

The Node rejects:

- an already consumed owner-and-nonce pair;
- a duplicate active creation intent for the same operation identity;
- an expired operation;
- a TIN collision when a concrete TIN is supplied;
- a malformed or conflicting idempotent operation;
- an owner mismatch for an update operation.

The nonce guard is atomic. A read followed by a separate write is not enough
because two Node workers could otherwise accept the same nonce concurrently.

### 6. Return verification evidence

On success, the Node returns evidence similar to:

```json
{
  "verificationType": "TSN_TIN_OPERATION",
  "verifiedPayload": {
    "intentType": "tin_creation",
    "programAssigned": true,
    "ownerPubkey": "<base58>",
    "ownerIntentHash": "<64 hex>",
    "nonce": "<64 hex>",
    "expiry": 0,
    "displayName": "<name>",
    "encryptedMasterSeed": "<base64>",
    "routeVersion": 1,
    "routeNonce": "<64 hex>",
    "tcapRouteVersion": 1
  }
}
```

Private ciphertext remains available only to the authenticated execution path
that requires it. Public operation views redact signatures, encrypted seed
data, route nonce, and other private fields.

The Node then PATCHes the Receiver with:

```json
{
  "id": "<receiver-work-id>",
  "owner": "tsn-node-local",
  "expectedVersion": 2,
  "status": "VERIFIED",
  "evidence": {
    "verificationType": "TSN_TIN_OPERATION",
    "verifiedPayload": {}
  }
}
```

The Receiver atomically changes:

```text
NODE_VERIFYING -> VERIFIED
```

A failure instead changes the work to `REJECTED` with a bounded reason.

## What This Job Achieves

A successful Node verification proves:

```text
The received bytes are well-formed.
The owner intent hash matches those bytes.
The owner signature matches the SDK message.
The operation is not expired.
The nonce is not replayed.
The route and TCap commitments satisfy Node rules.
The exact payload can now be offered to an authorized Cranker.
```

It does **not** prove:

```text
A Cranker has leased the work.
Solana accepted a transaction.
A TIN number has been assigned.
An identity PDA exists.
The private envelope can be opened after TIN assignment.
```

## Current Direct-Node Exception

The protocol test UI currently calls the Node's public-ish
`POST /tin-operations` path directly. That path runs normalization and replay
checks immediately and returns an `intentId`, but it bypasses the Receiver work
lifecycle described above.

The intended implementation is to submit the same SDK payload to Receiver
ingress first, then let this Node worker perform the exact same TIN-specific
verification branch from a Receiver lease.

## Acceptance Evidence

This Node stage is complete when evidence shows:

```text
Receiver work status before verification: RECEIVED
Node lease acquired: NODE_VERIFYING
Verification type: TSN_TIN_OPERATION
Verification result: VERIFIED
Receiver state after verification: VERIFIED
Cranker can lease the verified work: yes
```

A Node log that says “TIN operation queued” is not enough. It proves only direct
Node intake, not Receiver-first verification.
