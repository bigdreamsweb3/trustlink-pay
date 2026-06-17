# Epoch Settlement Mechanism

The TSN uses epoch-based reimbursement to balance fast payment for users with capital efficiency for Liquidity Providers (LPs). This document explains how epochs work, why they exist, and what they mean for operators and LPs.

---

## Why Epochs Exist

When Alice sends money to Bob through TrustLink Pay, the payment should be private. That means no public link between Alice's wallet and Bob's wallet on the blockchain.

The system breaks this link through a multi-stage settlement process. But this creates a timing gap: Bob wants his money immediately, while the sender's escrow cannot release funds until the payment is verified.

Epochs solve this timing problem by creating predictable reconciliation windows. Recipients get paid instantly from vault liquidity. Crankers get reimbursed from escrow at epoch close. LPs earn yields on deployed capital between epochs.

An epoch works like the daily batch settlement at a payment processor. Individual transactions happen in real time, but net settlement happens at the end of the batch window.

---

## The Epoch Cycle

An epoch lasts approximately 7 hours. The cycle repeats continuously with no gap between epochs.

### Step-by-Step Flow

| Step | Action | Who |
|------|--------|-----|
| 1 | Sender locks funds in escrow, creating a payment intent | Sender |
| 2 | Recipient initiates a claim | Recipient |
| 3 | Cranker detects the intent in the mempool | Cranker |
| 4 | Cranker acquires an exclusive execution lease | Cranker |
| 5 | Cranker pays the recipient from vault liquidity | Cranker |
| 6 | Cranker submits on-chain proof of execution | Cranker |
| 7 | Epoch closes, Mother Escrow processes reimbursements | System |
| 8 | Cranker's vault is credited from sender escrow | System |
| 9 | Settlement fees are distributed per protocol | System |

### Epoch Schedule

| Parameter | Value | Description |
|-----------|-------|-------------|
| Epoch Length | ~7 hours | Time between epoch closes |
| Epochs per Day | ~3-4 | Frequency of reimbursement cycles |

### What Happens at Epoch Close

1. Mother Escrow scans all executed payments from the epoch
2. Proofs are verified for each payment
3. Total reimbursement amounts are calculated per vault
4. Funds move from sender escrow to cranker vaults
5. Settlement fees are split: 87% LPs, 5% Cranker, 8% Treasury
6. A new epoch begins with reset vault liquidity

---

## Vault Reimbursement

When a cranker pays a recipient, they use vault liquidity. At epoch close, the Mother Escrow repays the vault from the sender's escrowed funds.

Sender Escrow -> Mother Escrow -> Cranker Vault -> Fee Split
- 87% to LP depositors
- 5% to Cranker
- 8% to Protocol Treasury

To receive reimbursement, the cranker must submit valid proof. This proof includes the payment intent ID, recipient wallet, amount transferred, timestamp, and cranker signature. Without valid proof, the reimbursement is not processed.

### Failed Reimbursement Scenarios

| Issue | Cause | Resolution |
|-------|-------|------------|
| Invalid proof | Incorrect data or signature | Cranker retries with correct proof |
| Insufficient escrow | Sender escrow depleted | Protocol holds secondary escrow |
| Epoch timeout | Cranker did not submit in time | Payment marked for manual review |

---

## Impact on Liquidity Providers

Epochs determine three things for LPs.

**Capital utilization.** Between epochs, vault funds are actively deployed to front payments. Higher utilization means more fee generation but also means more capital is in use at any given time.

**Yield timing.** LP earnings are calculated and distributed at each epoch close. Distributions are automatic and do not require manual claiming.

**Risk exposure.** Capital is deployed for the duration of the epoch, approximately 7 hours. This bounded window limits the time funds are at risk between reimbursement cycles.

---

## Operational Implications

**For Crankers.** Watch epoch timing to replenish vaults before close. Submit proof promptly or reimbursement is delayed. Monitor vault balance to avoid missing lease opportunities between epochs.

**For Liquidity Providers.** Funds are deployed between epoch boundaries. Track vault utilization -- higher usage means more fee generation. Scale deposits based on cranker demand and network activity.

---

## Related Documentation

- [CRANKER.md](./CRANKER.md) -- Cranker operator guide
- [LIQUIDITY.md](./LIQUIDITY.md) -- LP rewards and vault funding
- [ARCHITECTURE.md](./ARCHITECTURE.md) -- System architecture overview
