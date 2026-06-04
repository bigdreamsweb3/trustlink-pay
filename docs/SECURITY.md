# TrustLink Pay Security

This document describes the security and privacy model for TrustLink Pay, TINS, and TSN.

---

## Core Principles

- TINS provides the user-facing 10-digit receive identity.
- TSN separates sender-side escrow from recipient-side payout.
- Crankers verify and sponsor settlement work.
- The backend does not custody user funds.
- The app must show accurate state: pending, escrowed, claiming, executed, failed, or canceled.
- Phone and WhatsApp links are optional application-layer signals, not the protocol identity.

---

## TINS Security

TINS identity checks should verify:

1. configured TINS program id,
2. valid TINS PDA derivation,
3. on-chain account ownership,
4. decoded TIN value,
5. wallet/user binding where required by the application.

The public receive identity is the TIN. Applications may attach social or phone proofs later, but those proofs should resolve to the TIN rather than replace it.

---

## TSN Settlement Security

TSN settlement security depends on:

- sender authorization with nonce and expiry,
- cranker validation of signed payloads,
- cranker-sponsored transaction fee payment,
- verifier PDA funding for infrastructure costs,
- vault/token-account isolation,
- claim credit gating,
- proof recorded through transaction hashes and mempool state.

Crankers should reject work if:

- authorization is expired,
- signature verification fails,
- amount or mint is tampered,
- fee payer is wrong,
- settlement transaction structure is invalid,
- vault route does not match expected state.

---

## Public And Private Data

| Data | Visibility | Notes |
| --- | --- | --- |
| TIN | Public | User-facing receive identity |
| Display name | Public/app-facing | Helps sender confirm identity |
| Sender escrow transaction | Public if hash/program context is known | Sender-facing settlement hash |
| Recipient payout transaction | Public if hash/vault context is known | Recipient/operator proof path |
| Direct sender-to-recipient wallet path | Not exposed as normal transfer | Split by TSN settlement |
| Phone/WhatsApp link | Private application state | Optional notification/linking layer |

TrustLink should not claim absolute invisibility. The correct claim is reduced wallet graph exposure through settlement separation.

---

## Threats And Mitigations

| Threat | Mitigation |
| --- | --- |
| Address poisoning | Users pay TINs, not pasted addresses |
| Sender/recipient graph leakage | TSN separates escrow and payout paths |
| Tampered mempool work | Cranker validates transaction structure and signatures |
| Replay attacks | Nonce and expiry checks |
| Competing claim work | Claim credit and cranker coordination |
| Wrong identity route | TINS/account verification before settlement |
| Misleading UX | Sender and recipient status views are separated |

---

## UX Security Rules

- Sender should see escrow hash when funds are escrowed.
- Sender should not see recipient claim failure as sender payment failure.
- Recipient should see escrowed claimable payments until executed or canceled.
- Canceled work should be clearly labeled.
- Failed claim attempts should support retry where funds remain escrowed.

---

## Verification Checklist

- [ ] TIN is shown as the primary payment identity.
- [ ] Phone/WhatsApp is described only as optional notification/linking.
- [ ] Cranker rejects invalid sponsored settlement payloads.
- [ ] Escrowed sender payments do not appear as failed because claim execution failed.
- [ ] Recipient claim surfaces include escrowed unexecuted payments.
- [ ] Transaction details distinguish escrow hash from claim/proof hash.
