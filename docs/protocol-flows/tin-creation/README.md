# TIN V1 Creation Flow

The current creation design uses a private `TinV1Account`. Do not follow the
older `programAssigned: true` flow in historical notes: the TIN program does
not assign randomness, and owner-derived identity PDAs are retired for new
issuance.

## Current sequence

1. The XP backend uses a CSPRNG to generate a ten-digit TIN.
2. The trusted issuer and Node use the same high-entropy `TINS_LOOKUP_SECRET`
   to derive the lookup commitment. The issuer checks the commitment-derived
   PDA on the selected Solana cluster and retries if the account exists. There
   is no public all-zero lookup-secret fallback.
3. The trusted XP issuer derives the commitment and encrypts the TIN/name
   identity envelope. It returns the TIN only to the authenticated owner session
   so the browser can encrypt the owner-recovery envelope locally; the lookup
   secret never leaves trusted service configuration.
4. The wallet signs a recovery message; the SDK encrypts the TIN/name locally
   into a V4 owner-recovery envelope. The wallet separately signs the canonical
   UTF-8 approval message that binds the 32-byte intent hash. The XP backend
   adds an HMAC issuance proof bound to the owner, commitment, intent hash,
   nonce, and expiry. The proof contains no lookup secret.
5. The SDK submits the V1 payload through Receiver ingress. Receiver stores
   durable `TIN_OPERATION` work and wakes the Node without sending payload data
   in the wake request.
6. The Node leases the Receiver work, validates the V1 hash, canonical owner signature,
   HMAC proof, expiry, and TCap route commitments, then marks it `VERIFIED` or
   `REJECTED` on Receiver.
7. An authorized Cranker leases only `VERIFIED` work and submits
   `CreateTinV1` with the owner Ed25519 proof. The program creates the registry
   PDA from the lookup commitment and stores encrypted identity material.
8. Receiver records the Cranker result. The owner session displays the TIN as
   finalized only after the transaction is confirmed; it already held the TIN
   in order to prepare the encrypted recovery envelope.

The plaintext TIN and display name are absent from Receiver work and the
on-chain registry account. The TIN is present transiently in the trusted issuer
and owner browser session, and may be supplied to the trusted resolver for
lookup. The lookup secret is configured on the XP backend and Node, never in
Receiver, browser code, Cranker, or the repository.

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

## Wallet recovery and resolver boundary

The wallet is the user's ownership and authorization anchor. The TIP program
creates a single owner-indexed recovery PDA and rejects creation when that
owner already has an active TIN. The PDA contains only an encrypted recovery
envelope. On a new device, the SDK fetches it by owner PDA and uses a fresh
signature over the recovery message to decrypt the TIN locally; newly created
records use V4 envelopes. The SDK also retains read-only V2/V3 decryption for
existing records. None of these steps writes a plaintext `wallet -> TIN` index.

The issuer and Node must share a high-entropy lookup secret. The current flow
has no universal public all-zero fallback; the secret is not sent to the
browser, Receiver, or Cranker. Resolver API access and rate limiting are an
operational boundary and must be configured before exposing a resolver to
untrusted callers. Identity lookup alone does not authorize owner actions or
reveal a settlement transaction graph.

## Evidence boundary

Ingress acceptance means only that Receiver persisted the operation. `VERIFIED`
means Node accepted the signed payload. `CONFIRMED` means Cranker reported a
confirmed Solana transaction. Keep these stages distinct in SDK activity and
demo evidence; do not claim a TIN is finalized before `CONFIRMED`.
