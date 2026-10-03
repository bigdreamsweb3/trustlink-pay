# Identity and TIN

A **Transfer Identity Number (TIN)** is a human-readable 10-digit payment ID.
The sender can share it and confirm the recipient's resolved display name
before authorizing a transfer, instead of relying on a long wallet address.
The TIN identifies a payment destination; Solana transactions still use public
keys, token accounts, program accounts, and PDAs.

## Ownership and private registry

The owner wallet controls and authorizes its TIN. Creation is approved by the
owner's wallet, and the TIN V1 registry binds to that owner. Losing an app
session does not transfer or revoke ownership.

TIN V1 does not derive its registry PDA directly from the owner address. In
the universal namespace, the all-zero lookup value is intentionally public so
any integrated app can resolve a TIN without sharing a lost universal secret.
This makes the universal TIN/name mapping publicly derivable and enumerable;
it is not a confidentiality boundary. Issuer-specific namespaces may use a
strong private lookup key to restrict identity resolution. Receiver, Node,
and Cranker still process commitments and encrypted fields rather than a
plaintext TIN in the work payload.

This privacy boundary creates two current XP product gaps: reconnecting the
same wallet does not restore its existing TIN, and the current creation path
does not enforce one TIN per wallet. The product requirement is that a wallet
can recover and display its TIN without asking its owner to memorize or
re-enter the 10 digits, and cannot create a second TIN in the same issuer
namespace. The recovery record must be private and wallet-authorized; a
plaintext public wallet-to-TIN index is not acceptable.

## Create and resolve

1. The trusted XP backend generates a random 10-digit TIN and derives its
   keyed registry commitment using protected lookup material.
2. The SDK encrypts the TIN and display name and builds a TIN V1 creation
   intent. The wallet signs the canonical human-readable approval message.
3. The SDK submits the owner-authorized intent to Receiver. The Node verifies
   it and signs a decision receipt; the Cranker validates the receipt and
   submits direct or staged TIN program instructions.
4. The XP displays the TIN after the final Solana registry-creation
   transaction is confirmed and the registry account is verified.
5. To resolve a TIN for a transfer, the trusted resolver uses the supplied
   TIN and protected secret, then the SDK binds the authorized route into the
   transfer intent. The recipient's wallet authorizes wallet-controlled
   actions.

The current resolver still requires the TIN, so wallet-only recovery needs a
new owner-bound recovery record or equivalent index. The program must also
reserve a unique `(issuer namespace, owner)` slot during creation. In the
universal namespace, public lookup and possible enumeration of TIN/name
records are accepted by design; issuer-specific keys can restrict this
identity lookup. Neither lookup choice by itself reveals a settlement
transaction graph. Transaction visibility depends on the transfer and
settlement path, independently of TIN resolution.

## Data boundaries

| Data | Boundary |
| --- | --- |
| Program ID and commitment-derived PDA | Public protocol metadata; does not expose a wallet-to-TIN index |
| Owner authorization and route commitments | Integrity metadata; not the plaintext TIN |
| TIN, display name, and master-seed envelope | Encrypted in the TIN V1 registry |
| Lookup secret | Trusted issuer/resolver configuration; never browser, Receiver, Node, or Cranker input |

TIN is not by itself a legal identity or bank account. A display name can help
the sender confirm payment confidence, but it is not legal verification or
payment authorization.

For the detailed service flow, see [TIN creation protocol flows](protocol-flows/tin-creation/README.md)
and the [TIN V1 developer guide](../tsn-protocol/tsn-docs/developers/private-tin-issuance.mdx).
