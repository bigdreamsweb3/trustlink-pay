# TIP, TIN, and GPRU identity routing

The **Transfer Identity Protocol (TIP)** manages transfer identities and route
metadata. A **Transfer Identity Number (TIN)** is one human-readable,
10-digit identity within TIP, not the name of the whole protocol. A sender can
share the TIN and confirm the resolved display name before authorizing a
transfer. Solana transactions still use public keys, token accounts, program
accounts, and PDAs at the settlement boundary.

**GPRU (Guarded Privacy Routing Unit)** verifies proof-bound confidential state
transitions. TIP resolves identity and route membership; TCAP governs assets
and accounting. These responsibilities remain distinct in TSN's hybrid
settlement infrastructure.

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

The program also creates an owner-indexed recovery PDA containing the owner's
public key and wallet-encrypted TIN recovery envelope, and enforces one active TIN per owner.
After reconnecting, the owner can locate that PDA and decrypt the TIN locally
with the authorized recovery envelope workflow. No plaintext wallet-to-TIN index is needed.

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

## Display names and planned credential attestations

Current SDK and Node identity resolution return an owner-provided display name and an empty verified-credential list. Canonical payment messages can bind credential-shaped metadata, but that schema does not verify an issuer, government identity or business registration. A wallet signature proves approval/control of the signing key for the checked request, not legal identity by itself.

Optional issuer-backed attestations are planned for a TIN. A verified integration would need trusted issuer authentication, subject/wallet/TIN binding, credential expiry and revocation, explicit consent and a policy for what a sender can resolve. Solana attestation services or other network providers are evaluation possibilities; no provider partnership or completed credential verifier is claimed. See [SDK identity resolution](../tsn-protocol/sdks/tsn-sdk/src/tins.ts) and [Node identity resolution](../tsn-protocol/services/tsn-node/verification/identity/resolve_tin_identity_for_verification.py).

## Current GPRU design status

TIP V1 stores versioned GPRU encryption and balance-scan public keys, their
integrity bindings and separate route/policy commitments. Node prepares the
private witness, proof and encrypted owner Memo for native credit. Mother
authority authorizes TSNP, which invokes TCAP; TCAP checks the funding and
state context and invokes GPRU before advancing the shared state and credit
transcript atomically. Individual credit changes no reserve liability counters;
TCAP applies complete aggregate accounting through a separate proof-verified
action. See the [current credit ABI](laboratory/credit-abi.md).

The [November 16 Devnet checkpoint](laboratory/experiments/EXP-20261116-private-credit-epoch.md)
establishes two finalized native private credits and complete accounting of
their shared epoch. Retained debit, exit and Epoch Treasury instructions exist
in source, but this result does not establish a current end-to-end confidential
debit, TIN-to-TIN transfer or exit. Those capabilities require their own actor,
account, proof, conservation and execution review; source presence and native
credit evidence must not be substituted for it.

The owner recovery PDA is separate from the commitment-derived identity PDA
and lets the connected wallet locate its encrypted recovery envelope. Newly
created records use V4 recovery envelopes; the SDK retains read-only V2/V3
decryption for existing records. The ten-digit TIN remains encrypted, while
registration publicly associates the registry with its owner key through the
unsalted owner commitment, recovery account and creation history. This limits
unlinkability independently of encrypted identity contents; see the
[cryptography visibility boundary](laboratory/cryptography.md#visibility-and-trust).

## Data boundaries

| Data | Boundary |
| --- | --- |
| Program ID, commitment-derived PDA and registration owner binding | Public metadata; the ten-digit TIN is encrypted, but the owner key can be associated with its registry |
| Owner authorization and route commitments | Integrity metadata; not the plaintext TIN |
| TIN, display name, and master-seed envelope | Encrypted in the TIN V1 registry |
| Lookup secret | Trusted issuer and Node configuration; never browser, Receiver, or Cranker input |

TIN is not by itself a legal identity or bank account. A display name can help
the sender confirm payment confidence, but it is not legal verification or
payment authorization.

For the detailed service flow, see [TIN creation protocol flows](protocol-flows/tin-creation/README.md)
and the [TIN V1 developer guide](../tsn-protocol/tsn-docs/developers/private-tin-issuance.mdx).
