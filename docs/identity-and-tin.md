# TIP, TIN, and GPRU identity routing

The **Transfer Identity Protocol (TIP)** manages transfer identities and route
metadata. A **Transfer Identity Number (TIN)** is one human-readable,
10-digit identity within TIP, not the name of the whole protocol. A sender can
share the TIN and confirm the resolved display name before authorizing a
transfer. Solana transactions still use public keys, token accounts, program
accounts, and PDAs at the settlement boundary.

**GPRU (Guarded Privacy Routing Unit)** is being developed as a separate
protocol for unique transaction DNA and proof-verified confidential state
transitions. It is not merely a static authorization scope or another name
for TIN.

## Ownership and private registry

The owner wallet controls and authorizes its TIN. Creation is approved by the
owner's wallet, and the TIN V1 registry binds to that owner. Losing an app
session does not transfer or revoke ownership.

TIN V1 does not derive its registry PDA directly from the owner address. The
trusted issuer derives a keyed lookup commitment from the TIN and a high-entropy
`TINS_LOOKUP_SECRET`; that value must remain in trusted issuer and Node
configuration. No public all-zero lookup-secret fallback is part of the current
flow. Receiver work and Cranker execution carry the commitment and ciphertext,
not the plaintext TIN or lookup secret. The Node needs the secret to verify
issuer proofs and resolve an identity when explicitly asked to do so.

The program also creates an owner-indexed recovery PDA containing only the
wallet-encrypted recovery envelope, and enforces one active TIN per owner.
After reconnecting, the owner can locate that PDA and decrypt the TIN locally
with a wallet signature. No plaintext wallet-to-TIN index is needed.

## Create and resolve

1. The trusted issuer generates a random 10-digit TIN and uses protected
   lookup material to derive its keyed registry commitment and encrypted
   identity envelope.
2. The owner device creates an encrypted recovery envelope. The wallet signs
   the canonical approval message for the exact TIN V1 creation intent.
3. The SDK submits the owner-authorized payload to Receiver. The Node verifies
   it and signs a decision receipt; the Cranker validates the receipt and
   submits direct or staged TIN program instructions.
4. The issuer reveals the TIN to the owner's session after the final Solana
   creation transaction is confirmed and the registry account is verified.
5. A payment authorization names the recipient TIN. Node independently
   resolves the current TIP route, validates the request, and constructs the
   recipient transition; the sender SDK does not resolve recipient TIP state.

## Current GPRU design status

TIP V1 stores a versioned GPRU ElGamal scan public key and its integrity
commitment, with separate TIP route and policy commitments. The source now
contains a GPRU derivation primitive: Node can derive a unique per-transaction
DNA and one-time ElGamal public key, while the owner later derives the
matching private key locally from owner-held secret material. The primitive
is not yet connected to a deployable GPRU program or the TCAP settlement ABI.

The target credit flow has Node resolve TIP and construct the transition,
Receiver accept and store signed ingress, and Cranker submit immutable Node
authorized work. For a debit, an on-chain GPRU proof must establish that the
encrypted prior balance covers the debit and that the successor is correct.
For a TIN-to-TIN transfer, the proof must establish value conservation while
keeping both DNA outputs unique. TCAP changes reserve liabilities only after
GPRU validation succeeds atomically. Debit and exit remain unavailable until
the source program implements and verifies that contract.

The owner recovery PDA is separate from the commitment-derived identity PDA:
it lets the connected wallet locate its encrypted recovery envelope without a
public `wallet -> TIN` mapping. Newly created records use V4 recovery envelopes;
the SDK retains read-only V2/V3 decryption for existing records. Neither lookup
choice by itself reveals a settlement transaction graph. Transaction
visibility depends on the transfer and settlement path, independently of TIN
resolution.

## Data boundaries

| Data | Boundary |
| --- | --- |
| Program ID and commitment-derived PDA | Public protocol metadata; does not expose a wallet-to-TIN index |
| Owner authorization and route commitments | Integrity metadata; not the plaintext TIN |
| TIN, display name, and master-seed envelope | Encrypted in the TIN V1 registry |
| Lookup secret | Trusted issuer and Node configuration; never browser, Receiver, or Cranker input |

TIN is not by itself a legal identity or bank account. A display name can help
the sender confirm payment confidence, but it is not legal verification or
payment authorization.

For the detailed service flow, see [TIN creation protocol flows](protocol-flows/tin-creation/README.md)
and the [TIN V1 developer guide](../tsn-protocol/tsn-docs/developers/private-tin-issuance.mdx).
