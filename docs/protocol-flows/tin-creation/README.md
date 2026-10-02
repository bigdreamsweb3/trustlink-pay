# TIN V1 Creation Flow

The current creation design uses a private `TinV1Account`. Do not follow the
older `programAssigned: true` flow in historical notes: the TIN program does
not assign randomness, and owner-derived identity PDAs are retired for new
issuance.

## Current sequence

1. The XP backend uses a CSPRNG to generate a ten-digit TIN.
2. It uses the shared, protected `TINS_LOOKUP_SECRET` to derive the keyed
   lookup commitment and checks the commitment-derived PDA on the selected
   Solana cluster. If the account exists, it generates another TIN.
3. The SDK encrypts the TIN and display name into the identity envelope and
   builds the V1 owner intent. The browser receives ciphertext and commitments,
   never the lookup secret.
4. The owner wallet signs the raw 32-byte intent hash. The XP backend adds an
   HMAC issuance proof bound to the owner, commitment, intent hash, nonce, and
   expiry. The proof contains no lookup secret.
5. The SDK submits the V1 payload through Receiver ingress. Receiver stores
   durable `TIN_OPERATION` work and wakes the Node without sending payload data
   in the wake request.
6. The Node leases the Receiver work, validates the V1 hash, owner signature,
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

The SDK can resolve a TIN when the application supplies the TIN and its
authorized lookup secret. The registry intentionally does not provide a
publicly enumerable wallet-to-TIN reverse index. TSN XP currently retains a
newly issued TIN in the issuing browser session and resolves its identity after
finalization; reconnecting the wallet or opening another device does not yet
recover that TIN automatically. A future recovery flow must be explicitly
owner-authorized and preserve the keyed lookup boundary.

## Evidence boundary

Ingress acceptance means only that Receiver persisted the operation. `VERIFIED`
means Node accepted the signed payload. `CONFIRMED` means Cranker reported a
confirmed Solana transaction. Keep these stages distinct in SDK activity and
demo evidence; do not claim a TIN is finalized before `CONFIRMED`.
