# Builder update: a 10-digit payment identity for blockchain transfers

## Draft post

We have verified TINs on-chain and are improving the issuance and identity-resolution architecture. The first namespace is universal so TINs can work across participating apps. Issuer-specific namespaces, issuer discovery, and bank integrations are the next architecture direction, not features we are claiming are live.

Wallet addresses are useful to protocols, but they are long, easy to mistype, and hard to verify by eye. TSN's Transfer Identity Number (TIN) gives a person a human-readable, 10-digit payment ID to share. A sender can resolve it to the recipient's name before authorizing a transfer, adding a familiar identity check to a blockchain payment.

That identity layer also opens TSN to institutions. In a future issuer model, a bank or payment provider could give a customer a TSN payment ID linked to their existing account. A blockchain user could send to that ID, while the institution handles the crypto operations, customer support, and fees in its own service. The customer keeps the familiar institution relationship; TSN provides the settlement network between them and blockchain users.

**A 10-digit identity people can share. One settlement network institutions can join.**

## 45-second video outline

1. **0:00–0:08 — The user problem:** Contrast a long wallet address with a short TIN. Explain that the TIN is intended to let the sender check the recipient identity before authorizing.
2. **0:08–0:20 — Real issuance evidence:** Show a confirmed Devnet signature and decoded TIN account from an existing verified issuance. Identify the universal namespace and limit claims to fields verified from the transaction and account.
3. **0:20–0:36 — Institutional direction:** Show a concept diagram in which a bank maps its customer to a bank-branded TSN payment ID, handles its customer-facing crypto service and fees, and receives blockchain-originated transfers through TSN. Label issuer-specific namespaces and bank integration as proposed.
4. **0:36–0:45 — Boundary:** State that the universal TIN is the starting namespace; institutional issuance is an architecture direction. Do not present the concept diagram as a shipped integration.

## Recording guardrails

- Do not describe the issuer-specific namespace or bank flow as implemented until the protocol and issuer integration exist.
- Distinguish existing verified TIN transactions from the latest TIN V1 improvements; do not use an older transaction as proof of a newer program version.
- Do not show a mock signature, registry account, bank logo, or customer mapping as transaction evidence.
- The actual issuance canvas must link to a confirmed Devnet signature and independently decoded registry account. The concept canvas must be labelled `PROPOSED ARCHITECTURE` and must not be presented as on-chain state.
- Do not expose lookup secrets, private keys, customer records, or unencrypted identity data.
