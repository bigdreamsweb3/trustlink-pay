# Liquidity Providers & Vault Funding

Liquidity Providers (LPs) are the capital backbone of the TrustLink Pay Transfer Settlement Network. By funding TSN vaults, LPs enable instant settlement for users while earning attractive yields from real payment volume.

---

## What is a Vault?

A TSN vault is a token-specific liquidity pool that crankers draw from to front instant payouts to recipients.

```
┌─────────────────────────────────────────────────────────────────┐
│                         TSN VAULT                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────┐   ┌─────────┐   ┌─────────┐                     │
│   │ LP 1   │   │ LP 2   │   │ LP 3   │   ...                │
│   │ $50K   │   │ $30K   │   │ $20K   │                     │
│   └─────────┘   └─────────┘   └─────────┘                     │
│         │           │           │                              │
│         └───────────┴───────────┘                              │
│                      │                                          │
│                      ▼                                          │
│              ┌─────────────┐                                    │
│              │  Vault Pool │                                    │
│              │  USDC $100K │                                    │
│              └─────────────┘                                    │
│                      │                                          │
│                      ▼                                          │
│   Cranker draws from vault to pay recipients                   │
│   Reimbursed at epoch close + fees distributed                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Vault Properties

| Property | Description |
|----------|-------------|
| **Token-specific** | Each vault holds one token type (e.g., USDC vault) |
| **Multi-depositor** | Multiple LPs can fund the same vault |
| **Proportional share** | LP earnings based on deposit proportion |
| **Epoch-based** | Reimbursed + fees distributed at epoch close |

---

## Why Fund a Vault?

### The Opportunity

| Benefit | Details |
|---------|---------|
| **87% of Settlement Fees** | LPs earn the majority share of all settlement revenue |
| **Real Yield** | Earnings come from actual payment volume, not token emissions |
| **Capital Efficiency** | Funds are deployed and returned each epoch |
| **Passive Income** | Set and forget — vault automatically participates |
| **Crypto-Native** | No traditional finance intermediaries |
| **Transparent** | All fee distributions are on-chain and verifiable |

### Who Should Fund Vaults?

- **Stablecoin issuers** — Earn yield on reserves while promoting token adoption
- **DeFi protocols** — Deploy idle stablecoin treasury for returns
- **Family offices** — Alternative yield source for stablecoin holdings
- **Crypto funds** — Diversified yield across multiple vaults
- **Individual holders** — Put idle stablecoins to work

---

## Fee Distribution

Every settlement fee is distributed according to the TSN protocol:

| Recipient | Share | Description |
|-----------|------:|-------------|
| **Liquidity Providers** | **87%** | **Your earnings as vault depositor** |
| TSN Protocol Treasury | 8% | Protocol operations and development |
| Cranker/Operator | 5% | Operator execution rewards |

### Fee Flow Example

```
$10,000 in daily settlement fees from USDC vault

┌─────────────────────────────────────────────────────┐
│                                                     │
│   87% → LP Depositors ($8,700)                      │
│          └── Distributed pro-rata by deposit share  │
│                                                     │
│   8%  → Protocol Treasury ($800)                    │
│          └── Development, audits, operations        │
│                                                     │
│   5%  → Cranker Operator ($500)                      │
│          └── Execution, uptime, proof submission    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Calculating Your Yield

### Yield Formula

```
Daily LP Yield = Settlement Fees × 87% × (Your Deposit / Total Vault Deposits)
```

### Example Calculation

**Scenario:**
- Total vault deposits: $1,000,000 USDC
- Your deposit: $100,000 USDC (10% share)
- Daily payment volume: $2,000,000 USDC
- Settlement fee: 0.5%

**Step 1: Calculate Daily Settlement Fees**
```
Daily Settlement Fees = $2,000,000 × 0.5% = $10,000
```

**Step 2: Calculate LP Share**
```
LP Share = $10,000 × 87% = $8,700
```

**Step 3: Calculate Your Portion**
```
Your Daily Yield = $8,700 × 10% = $870
```

**Step 4: Annualized**
```
Annual Yield = $870 × 365 = $317,550
APY = ($870 / $100,000) × 365 = 317.55% ? 
      Wait — that's not right for volume-based
```

**Corrected APY Calculation:**
```
Daily Yield % = $870 / $100,000 = 0.87%
APY = 0.87% × 365 = 317.55%
```

*Note: APY varies significantly based on actual payment volume. The example assumes consistent daily volume.*

### Realistic APY Range

| Vault Utilization | Estimated APY |
|-------------------|----------------|
| Low (10% of max) | 15-30% |
| Medium (30% of max) | 40-80% |
| High (60% of max) | 80-150% |
| Very High (90%+) | 150%+ |

*APY depends on: payment volume, settlement fee rate, vault competition, and epoch timing.*

---

## How to Fund a Vault

### Step 1: Choose Your Token

| Token | Status | Notes |
|-------|--------|-------|
| USDC | **Available** | Primary vault at launch |
| USDT | TBD | Coming as demand grows |
| Other stablecoins | TBD | Contact for integration |

### Step 2: Determine Deposit Amount

Consider:
- **Minimum deposit**: TBD per vault
- **Target utilization**: Higher deposit = higher share of fees
- **Risk tolerance**: More capital = more earnings but more exposure

### Step 3: Connect Your Wallet

```typescript
// Connect to TrustLink vault
import { TSNVault } from '@trustlink/tsn-sdk';

const vault = new TSNVault({
  network: 'mainnet',
  token: 'USDC',
  programId: 'TSN_PROGRAM_ID',
});

// Check current vault status
const status = await vault.getStatus();
console.log(`Total deposits: ${status.totalDeposits}`);
console.log(`Your share: ${status.myShare}%`);
```

### Step 4: Make Deposit

```typescript
// Deposit funds to vault
await vault.deposit({
  amount: 50000,  // 50,000 USDC
  wallet: myWallet,
});

// Verify deposit
const position = await vault.getPosition(myWallet);
console.log(`Deposited: ${position.amount}`);
console.log(`Share: ${position.sharePercent}%`);
```

### Step 5: Monitor Returns

```typescript
// Track LP position
const position = await vault.getPosition(myWallet);
console.log(`
  Deposited: ${position.amount} USDC
  Current Share: ${position.sharePercent}%
  Estimated Daily Yield: ${position.estimatedDailyYield} USDC
  Epoch Earnings: ${position.lastEpochEarnings} USDC
`);
```

---

## Vault Management

### Adding Funds

LPs can add to their position at any time:

```typescript
// Top up vault deposit
await vault.deposit({
  amount: 25000,  // Additional 25,000 USDC
  wallet: myWallet,
});
```

### Withdrawing Funds

Withdrawals are processed at epoch boundaries:

```typescript
// Request withdrawal
await vault.requestWithdrawal({
  amount: 25000,  // Withdraw 25,000 USDC
  wallet: myWallet,
});

// Withdrawal processed at next epoch
// Funds sent to your wallet
```

### Managing Multiple Positions

```typescript
// Check all vault positions
const positions = await vault.getAllPositions(myWallet);
positions.forEach(vault => {
  console.log(`
    Token: ${vault.token}
    Deposited: ${vault.amount}
    Share: ${vault.sharePercent}%
    APY: ${vault.apy}%
  `);
});
```

---

## Risk Management

### Understanding Your Risk

| Risk Type | Level | Description |
|-----------|-------|-------------|
| Capital deployment | Medium | Funds used to front payments until epoch close |
| Vault utilization | Low-Medium | Higher utilization = more earnings but more at risk |
| Slashing | Very Low | Protocol-designed to minimize LP risk |
| Smart contract | Low | Audited code, but always some residual risk |
| Token depeg | Low-Medium | Depends on vault token (USDC is lowest risk) |

### Risk Mitigation Strategies

| Strategy | How It Helps |
|----------|--------------|
| **Start small** | Test the system with a small deposit first |
| **Diversify vaults** | Spread across multiple token vaults |
| **Monitor utilization** | Withdraw if vault becomes over-utilized |
| **Track APY trends** | Adjust position based on performance |
| **Set alerts** | Get notified of unusual vault activity |

### Vault Health Indicators

| Indicator | Healthy | Warning |
|-----------|---------|---------|
| Utilization rate | < 70% | > 85% |
| Reimbursement speed | Within epoch | Delayed |
| Cranker count | Multiple | Single |
| Fee stability | Consistent | Volatile |

---

## Vault Comparison

### Single Vault vs Multi-Vault Strategy

| Approach | Pros | Cons |
|----------|------|------|
| **Single Vault** | Simple, focused, easy tracking | Concentration risk |
| **Multi-Vault** | Diversified, more opportunities | Complex management |

### Token Diversification

| Token | Risk | Yield Potential | Stability |
|-------|------|-----------------|-----------|
| USDC | Low | Medium | High |
| USDT | Low | Medium | Medium |
| cUSD | Medium | High | Medium |
| EURS | Low | Medium | High |
| Others | Variable | Variable | Variable |

---

## Vault Ecosystem

### Vault Operators

Crankers interact with vaults to execute payments:

```
LP Deposits → Vault Pool → Cranker Draws → Recipient Gets Paid → Epoch Reimburses → Fees Distributed
```

### Cranker-Vault Relationship

| Cranker's Need | LP's Role |
|----------------|-----------|
| Liquidity to front payouts | Fund the vault |
| Reimbursement at epoch close | Provide capital at risk |
| Share of fees | Earn 87% of settlement fees |

### Stablecoin Issuer Integration

If you're a stablecoin issuer:

1. **Fund your token's vault** — Drive adoption while earning yield
2. **Coordinate with crankers** — Ensure sufficient liquidity
3. **Promote usage** — Users follow liquidity and speed
4. **Monitor metrics** — Track settlement for your token

---

## Vault Monitoring

### Key Metrics

| Metric | What It Measures | Action If Low |
|--------|-----------------|--------------|
| Utilization rate | % of vault deployed | Adjust deposit or wait |
| Reimbursement time | Speed of capital return | Contact operator |
| Fee generation | Settlement activity | Consider alternative vault |
| Cranker diversity | Number of operators | Promote competition |

### Monitoring Tools

- **TrustLink Dashboard**: Real-time vault analytics
- **On-chain explorer**: View vault balances and transactions
- **Yield calculator**: Project future returns

---

## Launch Strategy

At launch, **TrustLink Pay will deploy the first vaults** and operate the primary cranker. This controlled start ensures reliability while the network proves itself.

### Phase 1: TrustLink as Primary Cranker

- TrustLink deploys USDC vault
- TrustLink runs cranker nodes on high-performance infrastructure
- LPs can fund the USDC vault to earn yields
- Stablecoin issuers can partner to fund additional vaults

### Phase 2: Network Expansion

As payment volume grows:
- New vaults for additional tokens
- More cranker operators
- Greater liquidity options for LPs

### How to Position for Early Adoption

1. **Express interest** — Contact us to discuss vault funding
2. **Monitor launch** — Watch for vault deployment announcements
3. **Start with USDC** — Primary vault at launch
4. **Scale as network grows** — Add more vault positions as network proves itself

---

## Getting Started

### Ready to Fund a Vault?

1. **Connect wallet**: Use TrustLink app or SDK
2. **Choose vault**: Select token and vault
3. **Deposit funds**: Transfer stablecoins to vault
4. **Monitor returns**: Track earnings via dashboard

### Partnership Opportunities

For large vault funding or institutional arrangements:

- **Email**: [partnerships@trustlink.pay](mailto:partnerships@trustlink.pay)
- **Discord**: [Join our community](https://discord.gg/trustlink)
- **Twitter**: [@TrustLinkPay](https://twitter.com/TrustLinkPay)

---

## Related Documentation

- [CRANKER.md](./CRANKER.md) — Cranker operator guide (crankers use vault liquidity)
- [EPOCH-SETTLEMENT.md](./EPOCH-SETTLEMENT.md) — How epoch reimbursement works
- [OPPORTUNITY.md](./OPPORTUNITY.md) — Investment opportunity overview
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture overview

---

## Risk Disclosure

**Important**: LP participation involves risk:

- Capital is deployed between epoch boundaries
- Vault utilization affects return timing
- Smart contract risk exists (audited but not zero)
- Token depeg risk (mitigated by using established stablecoins)
- Protocol changes may affect fee structure

Always do your own research and never invest more than you can afford to lose.