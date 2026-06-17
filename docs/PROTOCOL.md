# TrustLink Pay Protocol Specification

TrustLink Pay is a TIN-first private stablecoin settlement protocol on Solana.

Users send to 10-digit Transfer Identity Numbers. TSN handles settlement without exposing a direct sender-wallet-to-recipient-wallet path.

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

Authorization includes:

- sender wallet
- recipient identity hash
- token mint
- amount
- fee terms
- nonce (a unique number that prevents replay attacks)
- expiry

The sender does not broadcast the final settlement transaction directly. A cranker validates and sponsors the escrow transaction.

---

## Settlement Flow

```text
1. Sender enters recipient TIN.
2. TINS or app state resolves the settlement route.
3. Sender signs TSN authorization.
4. Authorization enters TSN mempool.
5. Verified cranker validates the payload.
6. Cranker sponsors escrow transaction.
7. Funds lock into TSN vault path.
8. Intent status becomes escrowed.
9. Claim work becomes available.
10. Cranker executes payout from vault liquidity.
11. Proof is recorded through transaction hashes and mempool state.
12. Payment status becomes executed or settled.
```

---

## Cranker Role

Crankers:

- verify sender authorization
- verify transaction structure
- reject tampered mempool work
- sponsor escrow
- earn claim credit
- execute payout
- publish proof records

Claim credit keeps cranker incentives balanced: useful escrow work creates eligibility for claim work.

---

## Status Model

| Status | Meaning |
| --- | --- |
| `pending` | Authorization is waiting for cranker verification |
| `escrowed` | Funds moved into TSN escrow or vault path |
| `claimed` | Claim work is in progress |
| `executed` | Recipient payout and proof completed |
| `settled` | Epoch or accounting settlement completed |
| `canceled` | Work was rejected or expired before settlement |
| `failed` | A claim attempt failed; escrowed funds may still be claimable |

For sender UX, an escrowed payment should not be shown as failed when a recipient-side claim attempt fails. The sender-facing truth is that funds are escrowed for the recipient.

---

## Fee Model

| Fee Type | Purpose |
| --- | --- |
| Sender fee | Protocol or treasury infrastructure |
| Claim fee | Settlement and vault economics |
| Network fee | Paid by cranker or operator in sponsored flow |
| Reimbursement | Protocol accounting for useful operator work |

Settlement-fee split:

| Recipient | Share |
| --- | ---: |
| Liquidity Providers | 87% |
| TSN Protocol Treasury | 8% |
| Cranker or Operator | 5% |

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
