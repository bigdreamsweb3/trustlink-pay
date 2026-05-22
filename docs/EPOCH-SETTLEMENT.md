# Epoch Settlement Mechanism

The TSN uses epoch-based reimbursement to balance speed for users with capital efficiency for liquidity providers. This document explains how epochs work, why they exist, and what it means for operators and LPs.

---

## Why Epochs?

### The Problem Without Epochs

Traditional blockchain payments are immediate but **public**. When Alice pays Bob, everyone can see:
- Alice's wallet
- Bob's wallet
- The amount
- The exact timing

Even with privacy techniques, the wallet-to-wallet link remains visible on-chain.

### The TSN Solution

TSN breaks this link through a multi-stage settlement process. But breaking the link creates a timing gap:
1. Sender locks funds in escrow
2. Recipient claims from escrow
3. Who pays the recipient immediately?
4. When does the sender's escrow actually release funds?

**Epochs solve this timing problem** by creating predictable reconciliation windows where:
- Recipients get paid quickly (from vault liquidity)
- Crankers get reimbursed from escrow (at epoch close)
- Liquidity providers earn yields on deployed capital

---

## How Epochs Work

### Basic Epoch Cycle (~7 Hours)

```
┌─────────────────────────────────────────────────────────────────┐
│                        EPOCH CYCLE                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐   │
│  │ Sender │────▶│ Escrow  │────▶│ Cranker │────▶│Recipient│   │
│  │ Locks  │     │ Holds   │     │ Pays    │     │ Claims  │   │
│  │ Funds  │     │ Funds   │     │ from    │     │ Instantly│  │
│  └─────────┘     └────┬────┘     │ Vault   │     └─────────┘   │
│                       │          └─────────┘                   │
│                       │               │                         │
│                       │    Proof Submitted                     │
│                       │               │                         │
│  ┌─────────┐     ┌────▼────┐     ┌─────────┐                   │
│  │ Mother  │◀────│ Epoch   │◀────│ Vault   │                   │
│  │ Escrow  │     │ Close   │     │ Reimbursed│                  │
│  └────┬────┘     └─────────┘     └─────────┘                   │
│       │                                                           │
│       │  Fees Distributed: 87% LP / 5% Cranker / 8% Treasury    │
│       ▼                                                           │
│  ┌─────────┐                                                      │
│  │ New     │                                                      │
│  │ Epoch   │                                                      │
│  └─────────┘                                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Step-by-Step Flow

| Step | Action | Who | Description |
|------|--------|-----|-------------|
| 1 | Sender locks funds | Sender | Funds enter escrow vault, payment intent created |
| 2 | Recipient initiates claim | Recipient | Opens claim path, wallet connected |
| 3 | Cranker detects intent | Cranker | Monitors mempool for claimable intents |
| 4 | Cranker acquires lease | Cranker | Secures exclusive execution right for this payment |
| 5 | Cranker pays recipient | Cranker | Fronts payment from vault liquidity (instant for user) |
| 6 | Cranker submits proof | Cranker | On-chain verification of payment execution |
| 7 | Epoch closes | System | Mother Escrow processes all reimbursements |
| 8 | Vault reimbursed | System | Cranker's vault credited from sender escrow |
| 9 | Fees distributed | System | Settlement fees split per protocol |

---

## Epoch Timing

### Current Configuration

| Parameter | Value | Description |
|-----------|-------|-------------|
| Epoch Length | ~7 hours | Time between epoch closes |
| Epochs per Day | ~3-4 | Frequency of reimbursement cycles |
| Max Payments per Epoch | Vault-dependent | Limited by available liquidity |

### Epoch Schedule

```
Epoch 1: 00:00 - 07:00
Epoch 2: 07:00 - 14:00
Epoch 3: 14:00 - 21:00
Epoch 4: 21:00 - 00:00 (next day)
```

*Note: Times are illustrative. Actual schedule determined by protocol.*

### What Happens at Epoch Close?

1. **Mother Escrow activates** — Scans all executed payments from the epoch
2. **Proof verification** — Validates each cranker proof submission
3. **Reimbursement calculation** — Determines total amounts to reimburse per vault
4. **Fund transfer** — Moves funds from sender escrow → cranker vault
5. **Fee distribution** — Splits settlement fees: 87% LPs, 5% Cranker, 8% Treasury
6. **New epoch begins** — Fresh cycle with reset vault liquidity

---

## Capital at Risk

### Understanding Risk Windows

Between epochs, crankers have capital deployed in the following forms:

| Capital Type | Risk | Description |
|--------------|------|-------------|
| Vault Liquidity | Medium | Funds used to front payouts (reimbursed at epoch) |
| Lease Deposits | Low | Collateral to secure lease (returned after execution) |
| Operational SOL | Low | Wallet balance for gas fees |

### Managing Risk as a Cranker

**Capital Efficiency Formula:**

```
Available Lease Capacity = Vault Balance - Buffer (20%)
Maximum Concurrent Payments = Available Capacity / Average Payment Size
```

**Example:**
- Vault Balance: $100,000
- Buffer (20%): $20,000
- Available: $80,000
- Avg Payment: $100
- Max Concurrent: 800 payments

### Risk Mitigation

| Strategy | Benefit |
|----------|---------|
| Monitor vault balance | Avoid missed lease opportunities |
| Track epoch timing | Replenish before epoch close |
| Diversify vaults | Reduce single-token exposure |
| Maintain SOL reserve | Ensure transaction fees can be paid |

---

## Vault Reimbursement

### How Reimbursement Works

```
Sender Escrow Balance
        │
        ▼ (At Epoch Close)
   Mother Escrow
        │
        ├──▶ Cranker Vault (full payout amount)
        │
        └──▶ Fee Split
                │
                ├──▶ 87% → LP Depositors
                ├──▶ 5%  → Cranker Operator
                └──▶ 8%  → Protocol Treasury
```

### Reimbursement Verification

Crankers must submit valid proof to receive reimbursement. Proof includes:
- Payment intent ID
- Recipient wallet (on-chain, no sender link)
- Amount transferred
- Timestamp
- Cranker signature

### Failed Reimbursement Scenarios

| Issue | Cause | Resolution |
|-------|-------|------------|
| Invalid proof | Incorrect data or signature | Cranker retries with correct proof |
| Insufficient escrow | Sender escrow depleted | Protocol holds secondary escrow |
| Epoch timeout | Cranker didn't submit in time | Payment marked for manual review |

---

## Liquidity Provider Impact

### Why LPs Care About Epochs

Epochs determine:
- **Capital utilization** — How often your funds are deployed
- **Yield timing** — When you receive your share of fees
- **Risk exposure** — How long capital is at risk between epochs

### Epoch Yield Distribution

LPs earn through the following cycle:

```
1. LP deposits funds into vault
       │
       ▼
2. Cranker uses vault to front payouts
       │
       ▼
3. Epoch closes → Reimbursement + fees
       │
       ▼
4. 87% of fees → LP depositors (proportional to share)
```

### Calculating LP Yield

**Simple Yield Formula:**

```
Daily LP Yield = Total Settlement Fees × 87% × (Your Vault Share / Total Vault Deposits)
```

**Example:**
- Vault A total deposits: $500,000
- Your deposit: $50,000 (10% share)
- Daily settlement fees: $5,000
- Your daily yield: $5,000 × 87% × 10% = $435
- Annual yield: $435 × 365 = ~$158,775 (31.75% APY)

*Note: APY varies based on actual payment volume and vault utilization.*

### Yield Calculator

For a live yield projection, visit [TrustLink Yield Calculator](https://trustlink.pay/calculator).

---

## Comparing Epoch Systems

### TSN vs Other Settlement Systems

| Feature | TSN Epochs | Traditional Escrow | Payment Channels |
|---------|------------|-------------------|------------------|
| Settlement Speed | Minutes (claim) | Hours/Days | Instant |
| Privacy | Full | Partial | Full |
| Capital Requirement | Vault funding | None | Channel funding |
| Operator Model | Crankers | None | Watchtowers |
| Complexity | Medium | Low | High |
| Yield Opportunity | Yes | No | Yes (for channels) |

### Why TSN Uses 7-Hour Epochs

| Factor | Consideration |
|--------|---------------|
| Solana block time | ~400ms, fast finality |
| Network congestion | Buffer for peak usage |
| Cranker monitoring | Reasonable polling intervals |
| LP comfort | Not too long for capital lock |
| Protocol overhead | Balance between frequency and cost |

---

## Operational Implications

### For Crankers

- **Watch epoch timing** — Replenish vault before epoch close
- **Submit proof promptly** — Late proof = delayed reimbursement
- **Monitor vault balance** — Depleted vault = missed opportunities
- **Track reimbursement logs** — Verify you're being reimbursed correctly

### For Liquidity Providers

- **Understand capital lockup** — Funds unavailable until epoch close
- **Track utilization** — Higher vault usage = more earnings
- **Watch epoch performance** — Consistent reimbursement = healthy network
- **Adjust deposit size** — Scale vault based on cranker demand

### For Stablecoin Issuers

- **Plan vault funding** — Size vault based on expected volume
- **Coordinate with crankers** — Ensure sufficient liquidity for your token
- **Monitor epoch metrics** — Track settlement speed for your token

---

## Epoch Monitoring

### Key Metrics to Watch

| Metric | What It Tells You |
|--------|-------------------|
| Epoch close time | Consistency of reimbursement cycle |
| Vault utilization | How much of available liquidity is deployed |
| Reimbursement lag | Time between payout and reimbursement |
| Fee distribution | Your share of settlement revenue |
| Failed proofs | Issues requiring attention |

### Monitoring Tools

- **Cranker dashboard**: `http://localhost:3002/dashboard`
- **TSN explorer**: View epoch status and payment history
- **Vault analytics**: Track LP position performance

---

## Security Considerations

### What Protects Epoch Settlement

| Protection | How It Works |
|------------|--------------|
| Proof requirement | Only valid proof triggers reimbursement |
| Lease exclusivity | One cranker per payment prevents double-spend |
| Epoch atomicity | All reimbursements processed together |
| Escrow isolation | Each payment has separate escrow |
| Cranker registration | Only verified operators can execute |

### Potential Attack Vectors

| Attack | Mitigation |
|--------|------------|
| Fake proof submission | Cryptographic verification required |
| Epoch front-running | Lease exclusivity prevents races |
| Vault draining | Buffer requirements and monitoring |
| Replay attacks | Unique proof per payment |

---

## Related Documentation

- [CRANKER.md](./CRANKER.md) — Cranker operator guide
- [LIQUIDITY.md](./LIQUIDITY.md) — LP rewards and vault funding
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture overview
- [PROTOCOL.md](./PROTOCOL.md) — Core protocol specifications

---

## Questions?

For technical questions about epoch settlement, reach out via:
- **Discord**: [TrustLink Community](https://discord.gg/trustlink)
- **Email**: [tech@trustlink.pay](mailto:tech@trustlink.pay)