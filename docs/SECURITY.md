# TrustLink Pay Security

This document describes the security and privacy model for TrustLink Pay, TINS, and TSN.

## Core Principles

- TINS provides the user-facing 10-digit receive identity.
- TSN separates sender-side escrow from recipient-side payout.
- Crankers verify and sponsor settlement work.
- The backend does not custody user funds.
- The app must show accurate state: pending, escrowed, claiming, executed, failed, or canceled.
- Phone and WhatsApp links are optional application-layer signals, not the protocol identity.

## Privacy Model

TSN does not make Solana private in the absolute sense. It changes the payment graph.

| Normal Transfer | TSN Settlement |
| --- | --- |
| Sender wallet transfers directly to recipient wallet | Sender funds escrow path |
| Recipient address appears in sender-side payment | Recipient payout is separated |
| Wallet graph is easy to follow from either side | Full path requires transaction and program context |
| App identity is wallet address | App identity is TIN |

## TINS Security

TINS identity validation confirms:

1. the configured TINS program ID,
2. a valid TINS account derivation,
3. on-chain account ownership,
4. a decoded TIN value,
5. wallet-to-TIN binding where the application requires it.

The public receive identity is the TIN. Applications may attach social or phone proofs later, but those proofs should resolve to the TIN rather than replace it.

## TSN Settlement Security

TSN settlement security depends on:

- sender authorization with nonce and expiry,
- Cranker validation of signed payloads,
- Cranker-sponsored transaction fee payment,
- verifier account funding for infrastructure costs,
- vault and token-account isolation,
- claim credit gating,
- proof recorded through transaction hashes and mempool state.

Crankers should reject work if:

- authorization is expired,
- signature verification fails,
- amount or mint is tampered,
- fee payer is wrong,
- settlement transaction structure is invalid,
- vault route does not match expected state.

## Public and Private Data

| Data | Visibility | Notes |
| --- | --- | --- |
| TIN | Public | User-facing receive identity |
| Display name | Public/app-facing | Helps sender confirm identity |
| Sender escrow transaction | Public if hash or program context is known | Sender-facing settlement hash |
| Recipient payout transaction | Public if hash or vault context is known | Recipient/operator proof path |
| Direct sender-to-recipient wallet path | Not exposed as a normal transfer | Split by TSN settlement |
| Phone/WhatsApp link | Private application state | Optional notification and linking layer |

TrustLink should not claim absolute invisibility. The correct claim is reduced wallet graph exposure through settlement separation.

## Threats and Mitigations

| Threat | Mitigation |
| --- | --- |
| Address poisoning | Users pay TINs, not pasted addresses |
| Sender/recipient graph leakage | TSN separates escrow and payout paths |
| Tampered mempool work | Cranker validates transaction structure and signatures |
| Replay attacks | Nonce and expiry checks |
| Competing claim work | Claim credit and Cranker coordination |
| Wrong identity route | TINS and account verification before settlement |
| Misleading UX | Sender and recipient status views are separated |

## UX Security Rules

- Sender should see escrow hash when funds are escrowed.
- Sender should not see recipient claim failure as sender payment failure.
- Recipient should see escrowed claimable payments until executed or canceled.
- Canceled work should be clearly labeled.
- Failed claim attempts should support retry where funds remain escrowed.

## Foundational Security Philosophy

Read [TrustLink Pay Security Philosophy: Secure Web3 Payments Without Becoming a Bank of Regret](./SECURITY-PHILOSOPHY.md) for the team-level security thesis behind TINS, TSN, SAS, Crankers, OTDT, and the Mempool runtime.
