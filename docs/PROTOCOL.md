# TrustLink Pay Protocol Specification

TrustLink Pay is a TIN-first private stablecoin settlement protocol on Solana.

Users send to 10-digit Transfer Identity Numbers. TSN handles settlement without exposing a simple direct sender-wallet-to-recipient-wallet path.

---

## Protocol Layers

| Layer | Role |
| --- | --- |
| TINS | 10-digit payment identity |
| TSN Mempool | Pending authorization and claim work |
| TSN Program | Escrow, vault, cranker, and accounting rules |
| Cranker Network | Verification, sponsorship, payout execution |
| TrustLink App | First user-facing product and status surface |

---

## Payment Identity

The recipient is identified by a TIN.

```text
TIN -> settlement route -> TSN vault path
```

Phone numbers, WhatsApp, and social identities are optional links to a TIN. They are not the protocol identity.

---

## Sender Authorization

The sender signs approval for a specific payment.

Authorization covers:

- sender wallet,
- recipient identity hash,
- token mint,
- amount,
- fee terms,
- nonce,
- expiry.

The sender does not broadcast the final settlement transaction directly. A cranker validates and sponsors the escrow transaction.

---

## Settlement Flow

```text
1. Sender enters recipient TIN.
2. TINS/app state resolves the settlement route.
3. Sender signs TSN authorization.
4. Authorization enters TSN mempool.
5. Verified cranker validates the payload.
6. Cranker sponsors escrow transaction.
7. Funds lock into TSN vault/token account path.
8. Intent status becomes escrowed.
9. Claim work becomes available.
10. Cranker executes payout from vault liquidity.
11. Proof is recorded through transaction hashes and mempool state.
12. Payment status becomes executed/settled.
```

---

## Privacy Model

TSN does not make Solana private in the absolute sense. It changes the payment graph.

| Normal Transfer | TSN Settlement |
| --- | --- |
| Sender wallet transfers directly to recipient wallet | Sender funds escrow/vault path |
| Recipient address appears in sender-side payment | Recipient payout is separated |
| Wallet graph is easy to follow from either wallet | Full path requires tx/vault/program context |
| App identity is wallet address | App identity is TIN |

The goal is reduced wallet exposure, not accountability-free anonymity.

---

## Cranker Role

Crankers:

- verify sender authorization,
- verify transaction structure,
- reject tampered mempool work,
- sponsor escrow,
- earn claim credit,
- execute payout,
- publish proof records.

Claim credit exists so cranker incentives stay balanced: useful escrow work creates eligibility for claim work.

---

## Status Model

| Status | Meaning |
| --- | --- |
| `pending` | Authorization is waiting for cranker verification |
| `escrowed` | Funds moved into TSN escrow/vault path |
| `claimed` | Claim work is in progress |
| `executed` | Recipient payout/proof completed |
| `settled` | Epoch/accounting settlement completed |
| `canceled` | Work was rejected or expired before useful settlement |
| `failed` | A claim attempt failed, but escrowed funds may still be claimable |

For sender UX, an escrowed payment should not be shown as failed because a recipient-side claim attempt failed. The sender-facing truth is that funds are escrowed for the recipient.

---

## Fee Model

| Fee Type | Purpose |
| --- | --- |
| Sender fee | Protocol/treasury infrastructure |
| Claim fee | Settlement and vault economics |
| Network fee | Paid by cranker/operator in sponsored flow |
| Reimbursement | Protocol accounting for useful operator work |

Current settlement-fee split:

| Recipient | Share |
| --- | ---: |
| Liquidity Providers | 87% |
| TSN Protocol Treasury | 8% |
| Cranker/Operator | 5% |

---

## Security Properties

- TIN-first receive identity
- Sender authorization with nonce and expiry
- Cranker-only verification path
- Sponsored settlement
- Vault isolation
- Claim credit gating
- Off-chain proof record with transaction hashes
- User-facing status separation between sender and recipient views
