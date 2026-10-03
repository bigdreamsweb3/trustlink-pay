# TIN V1 Creation Flow

The current creation design uses a private `TinV1Account`. Do not follow the
older `programAssigned: true` flow in historical notes: the TIN program does
not assign randomness, and owner-derived identity PDAs are retired for new
issuance.

## Current sequence

1. The XP backend uses a CSPRNG to generate a ten-digit TIN.
2. It uses the universal public all-zero namespace value, or the issuer's
   private namespace value, to derive the lookup commitment and checks the
   commitment-derived PDA on the selected
   Solana cluster. If the account exists, it generates another TIN.
3. The SDK encrypts the TIN and display name into the identity envelope and
   builds the V1 owner intent. The browser receives ciphertext and commitments,
   never a private issuer lookup value.
4. The owner wallet signs the canonical UTF-8 approval message that binds the
   32-byte intent hash. The XP backend adds an
   HMAC issuance proof bound to the owner, commitment, intent hash, nonce, and
   expiry. The proof contains no lookup secret.
5. The SDK submits the V1 payload through Receiver ingress. Receiver stores
   durable `TIN_OPERATION` work and wakes the Node without sending payload data
   in the wake request.
6. The Node leases the Receiver work, validates the V1 hash, canonical owner signature,
   HMAC proof, expiry, and TCap route commitments, then marks it `VERIFIED` or
   `REJECTED` on Receiver.
7. An authorized Cranker leases only `VERIFIED` work and submits
   `CreateTinV1` with the owner Ed25519 proof. The program creates the registry
   PDA from the lookup commitment and stores encrypted identity material.
8. Receiver records the Cranker result. The XP session returns the generated
   TIN to its owner only after the transaction is confirmed.

The plaintext TIN and display name are absent from Receiver work and the
on-chain account. The TIN remains only in the trusted XP session and the
resolver's protected lookup boundary. The shared secret is configured on the
XP backend and Node, never Receiver, browser code, Cranker, or the repo.

## Documents

- [01 Receiver ingress](01-receiver-ingress.md) describes the exact payload
  and Receiver responsibility.
- [02 Node verification](02-node-verification.md) identifies the retired
  program-assigned schema as historical and documents the current signed V1
  verification receipt.
- [03 Cranker lease](03-cranker-lease.md) documents receipt validation and
  authorized work leasing.
- [04 On-chain finalization](04-onchain-finalization.md) describes direct and
  staged creation transactions.
- [05 Evidence](05-evidence.md) records the observed Devnet completion and the
  evidence needed for future captures.
- [TIN V1 canonical rules](../../team/tin/tin-v1-canonical-rules.md) defines
  the privacy, lookup, and deployment boundaries.
- [Private TIN developer guide](../../../tsn-protocol/tsn-docs/developers/private-tin-issuance.mdx)
  documents the SDK and service integration.

## XP identity lookup limitation

The wallet is the user's ownership and authorization anchor: only its owner
can approve creation and wallet-controlled identity actions. The TIN registry
is not derived directly from the wallet address. The public all-zero lookup
value in the universal issuer allows anyone to derive universal TIN/name
records, which is intentional and does not by itself reveal transfer history.
The product requirement is that reconnecting the same wallet
automatically restores the owner's TIN without requiring the ten digits, and
that the program enforces one TIN per owner in the universal issuer namespace.
TSN XP does not implement these features yet, so reconnecting does not restore
the identity and repeated creation is currently possible. Recovery requires a
private owner-bound record or equivalent mechanism; do not add a plaintext
`wallet -> TIN` index. Issuer-specific namespaces may use private lookup
values to restrict identity resolution. These are product and program gaps,
not a loss of ownership.

An issuer may place a private namespace value behind its own resolver API and
give partners scoped API keys. Partners submit a TIN to that API without
receiving the issuer value. This API model is a planned integration pattern;
it does not make the partner an owner of the TIN or authorize activity
monitoring. Wallet authorization remains the boundary for owner activity
access.

## Evidence boundary

Ingress acceptance means only that Receiver persisted the operation. `VERIFIED`
means Node accepted the signed payload. `CONFIRMED` means Cranker reported a
confirmed Solana transaction. Keep these stages distinct in SDK activity and
demo evidence; do not claim a TIN is finalized before `CONFIRMED`.
