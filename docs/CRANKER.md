# Cranker Operators

A Cranker is a network operator that executes payments on the TrustLink Pay Transfer Settlement Network (TSN). Think of a cranker like a courier who pays for a package delivery out of their own cash float. At the end of their shift, they get reimbursed from the sender's funds plus a fee for their work.

Without crankers, a recipient would have to wait for on-chain settlement before receiving funds. Crankers solve this by paying recipients instantly from vault liquidity pools, submitting on-chain proof of execution, and getting reimbursed at epoch close.

---

## What Does a Cranker Do?

Crankers perform five tasks.

**Monitor payment intents.** A payment intent is a signed authorization from a sender that specifies who gets paid and how much. Crankers watch the off-chain mempool for these intents.

**Acquire execution leases.** A lease is an exclusive right to execute a specific payment within an epoch. Only one cranker can hold the lease for a given payment at any time. This prevents double execution.

**Front instant payouts.** Instead of making the recipient wait for on-chain settlement, the cranker pays them immediately from vault liquidity. A vault is a token-specific liquidity pool funded by Liquidity Providers (LPs).

**Submit proof of payment.** The cranker sends on-chain proof that the payment was executed correctly. The TSN protocol verifies this proof before releasing funds.

**Receive epoch reimbursement.** At the end of each epoch, the Mother Escrow repays the cranker's vault and distributes settlement fees.

---

## Compensation Structure

Every settlement fee is split three ways:

| Recipient | Share | Description |
|-----------|------:|-------------|
| Liquidity Providers | 87% | Fund the vaults that enable instant payout |
| Protocol Treasury | 8% | Protocol operations and development |
| **Cranker/Operator** | **5%** | Operator execution rewards |

Liquidity Providers (LPs) are depositors who fund vaults in exchange for a share of fees. See [LIQUIDITY.md](./LIQUIDITY.md) for details.

---

## Epoch Settlement

An epoch is a fixed time window between reimbursement events, currently approximately 7 hours. At epoch close, the Mother Escrow processes all pending reimbursements.

### The Epoch Cycle

1. The cranker pays the recipient from vault liquidity
2. The cranker submits on-chain proof of execution
3. The epoch closes and the Mother Escrow processes all reimbursements
4. The cranker's vault is credited with the full payout amount
5. Settlement fees are split: 87% to LPs, 5% to cranker, 8% to treasury

### Reimbursement Flow

Sender Escrow -> Mother Escrow -> Cranker Vault -> Fee Split

- 87% to LP depositors
- 5% to Cranker
- 8% to Protocol Treasury

### Capital at Risk

Between epochs, cranker capital is deployed in three forms:

| Capital Type | Description |
|--------------|-------------|
| Vault Liquidity | Funds used to front payouts, reimbursed at epoch close |
| Lease Deposits | Collateral to secure leases, returned after execution |
| Operational SOL | Wallet balance for transaction fees |

Monitor vault balance and epoch timing. A depleted vault means missed lease opportunities.

---

## Setup

The cranker software lives in the repository under `tsn-cranker-sdk/` and `tsn-cranker-op-daemon/`. See [DEPLOYMENT.md](./DEPLOYMENT.md) for install, build, and initialization commands.

After setup, the cranker daemon connects to the mempool, monitors for payment intents, and executes them automatically.

---

## Related Documentation

- [EPOCH-SETTLEMENT.md](./EPOCH-SETTLEMENT.md) -- Epoch mechanics and reimbursement details
- [LIQUIDITY.md](./LIQUIDITY.md) -- Vault funding and LP rewards
- [DEPLOYMENT.md](./DEPLOYMENT.md) -- Deployment runbook
- [ARCHITECTURE.md](./ARCHITECTURE.md) -- System architecture overview

## Required Operator Reading

Cranker operators should read [TrustLink Pay Security Philosophy: Secure Web3 Payments Without Becoming a Bank of Regret](./SECURITY-PHILOSOPHY.md) before operating TSN infrastructure. It explains why speed, correctness, privacy, and restraint matter in the Cranker role.
