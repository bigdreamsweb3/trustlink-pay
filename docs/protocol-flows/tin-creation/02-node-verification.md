# TIN Creation: Node Verification

The Node is the only service that decides whether a Receiver-leased private
TIN V1 creation request satisfies the program contract. Receiver persists and
leases work; the Cranker executes only a Node-verified request. The retired
`programAssigned` payload, plaintext `displayName`, PRU configuration hash,
and public-route envelope are not accepted by the current Receiver contract.

## Runtime position

```text
Receiver: RECEIVED
    -> Node lease: NODE_VERIFYING
    -> Node decision: VERIFIED or REJECTED
    -> Receiver stores signed decision
    -> VERIFIED work is available to an authorized Cranker
```

The Node reads and updates work only through the authenticated Receiver API:

```text
POST  /api/internal/node/work
PATCH /api/internal/node/work
```

Browser and Cranker callers do not use this verification boundary.

## Validation contract

For `TIN_OPERATION`, the Node validates the allowlisted Receiver payload:

- `intentType` is `tin_creation` and the owner public key is a 32-byte Solana key.
- The lookup commitment, owner intent hash, nonce, route nonce, metadata hash,
  and all TCap commitments are valid 32-byte hexadecimal values.
- The encrypted identity, owner recovery, master-seed envelope, and owner
  signature use their required base64 encodings.
- The expiry is in the future, the route version is positive, and the TCap
  relationship binding is valid.
- The HMAC issuance proof matches the configured Node issuer secret without
  exposing that secret to Receiver, browser, or Cranker.
- The length-prefixed `TSN_TIN_V1_CREATE` hash is reconstructed from the exact
  program inputs and equals `ownerIntentHash`.
- The Ed25519 signature verifies over the canonical printable message from
  `buildTinOwnerIntentMessage(intentHash)`. The same message and signature are
  placed in the Ed25519 instruction immediately before program execution.
- The owner-and-nonce pair has not already been consumed.

The Node does not decrypt the identity envelope, generate a TIN, create a PRU
route, submit a Solana transaction, or disclose the encrypted fields in public
coordination views.

## Verification receipt

On success, the Node returns the normalized private V1 payload and
`verificationType: "TSN_TIN_OPERATION"` as Receiver evidence. Receiver stores
the payload delta rather than a second full copy. The Node signs a separate
Ed25519 verification receipt that binds the work ID and kind, decision, input
payload commitment, evidence commitment, Cranker execution-payload commitment,
lease ID and version, Node identity, key ID, and signing time.

The Cranker verifies that receipt with `TSN_NODE_VERIFICATION_PUBLIC_KEY` and
recomputes the execution-payload commitment before it submits direct or staged
`CreateTinV1`. A malformed, expired, missing, or mismatched receipt stops the
operation.

## Failure behavior

Any validation failure returns a bounded reason and changes the leased work to
`REJECTED`. A successful decision proves only that the private TIN V1 request
is valid and available to an authorized Cranker. It does not prove that Solana
accepted the transaction or that the registry account exists.
