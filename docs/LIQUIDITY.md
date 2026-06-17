# Liquidity Providers and Vault Funding

Liquidity Providers (LPs) are depositors who fund TSN vaults. A vault is a token-specific liquidity pool that crankers draw from to front instant payouts to recipients. Without LP deposits, crankers would have no capital to execute instant payments.

When a sender makes a payment through TrustLink Pay, the funds are locked in escrow. The recipient wants to be paid immediately, not wait for on-chain settlement. The cranker solves this by paying the recipient from vault liquidity. The vault is then reimbursed at epoch close from the sender's escrowed funds. LPs provide the capital that makes this instant payout possible and earn settlement fees in return.

---

## What Is a Vault?

A vault holds one token type. For example, a USDC vault holds only USDC. Multiple LPs can fund the same vault, and each LP earns fees proportional to their share of the total deposits. An epoch is a fixed time window (approximately 7 hours) between reimbursement events.

| Property | Description |
|----------|-------------|
| Token-specific | Each vault holds one token type |
| Multi-depositor | Multiple LPs can fund the same vault |
| Proportional share | LP earnings based on deposit proportion |
| Epoch-based | Reimbursed and fees distributed at epoch close |

---

## Fee Distribution

Every settlement fee is split three ways:

| Recipient | Share | Description |
|-----------|------:|-------------|
| **Liquidity Providers** | **87%** | Your earnings as vault depositor |
| Protocol Treasury | 8% | Protocol operations and development |
| Cranker/Operator | 5% | Operator execution rewards |

---

## How Vault Funding Works

To become an LP, deposit stablecoins into a vault of your choice. The vault records your deposit and tracks your proportional share of the total pool.

At each epoch close, settlement fees from that epoch are distributed to LPs in proportion to their vault share. Your vault balance grows with each distribution.

Withdrawals are processed at epoch boundaries. When you request a withdrawal, your proportional share is calculated and the funds are returned from the vault at the next epoch close.

---

## Initializing a Vault

Vaults must be initialized before they can accept deposits. From the repository root, run:

```powershell
npm run cranker -- init-vault <TOKEN_MINT>
```

This creates the on-chain vault account for the specified token mint. See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full initialization sequence.

---

## Related Documentation

- [CRANKER.md](./CRANKER.md) -- How crankers use vault liquidity
- [EPOCH-SETTLEMENT.md](./EPOCH-SETTLEMENT.md) -- How epoch reimbursement affects LP returns
- [DEPLOYMENT.md](./DEPLOYMENT.md) -- Deployment runbook
- [ARCHITECTURE.md](./ARCHITECTURE.md) -- System architecture overview
