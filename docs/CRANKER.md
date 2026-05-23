# Cranker Operators: Execution Infrastructure for TrustLink Pay

A Cranker is a specialized network operator that powers the TrustLink Pay Transfer Settlement Network (TSN). Crankers are the backbone of fast, private payments on Solana.

---

## What Does a Cranker Do?

Crankers are responsible for:

1. **Monitoring Payment Intents** — Watch the off-chain mempool for payment intents and claim requests
2. **Acquiring Execution Leases** — Secure the exclusive right to execute a payment within an epoch
3. **Fronting Instant Payouts** — Pay recipients immediately from liquidity vaults (near-instant claims)
4. **Submitting Proof of Payment** — On-chain verification that the payment was executed
5. **Managing Epoch Reimbursements** — Receive reimbursement from escrow at epoch close

### The Cranker Role in Context

```
Sender locks funds → Cranker monitors → Cranker pays recipient → Cranker submits proof → Epoch reimburses Cranker
```

Crankers ensure transfers remain private (no direct exposure of sender/receiver wallets) while delivering fast, reliable claims. They act as reliable "keepers" that guarantee smooth settlement execution.

---

## Why Become a Cranker?

### Compelling Incentives

| Benefit | Description |
|---------|-------------|
| **5% Operator Share** | Earn 5% of all settlement fees for every payment you execute |
| **Real Yield** | Earnings come from actual transaction volume, not inflationary token emissions |
| **Stablecoin Adoption** | Drive adoption of your token for daily payments — the more volume, the more you earn |
| **Full Control** | Run your own node, set your own schedule, manage your own infrastructure |
| **Early Mover Advantage** | Be among the first operators as the network grows |

### Who Should Run a Cranker?

- **Stablecoin issuers** who want their token used for daily payments
- **Payment service providers** looking to integrate with TrustLink
- **Crypto-native operators** with infrastructure expertise
- **DeFi protocols** seeking yield on stablecoin reserves
- **Venture-backed firms** with capital to deploy for yield

---

## Compensation Structure

Crankers earn the **operator share** of settlement fees. The current fee split:

| Recipient | Share | Notes |
|-----------|------:|-------|
| Liquidity Providers | 87% | Vault capital that enables instant payout |
| Protocol Treasury | 8% | Protocol operations and development |
| **Cranker/Operator** | **5%** | **Your earnings** |

### Example Earnings

If a vault processes $1,000,000 in daily payment volume with a 0.5% settlement fee ($5,000 daily revenue):

- **LP Share (87%)**: $4,350 → distributed to vault depositors
- **Protocol (8%)**: $400 → treasury
- **Cranker Share (5%)**: $250 → operator

*Daily earnings scale with volume. Higher payment volume = higher cranker earnings.*

---

## Launch Strategy: Phased Rollout

At launch, **TrustLink Pay will be the first and primary cranker operator**. Running a cranker will not be open to everyone initially. This ensures high reliability, speed, and security while the network proves itself.

### Phase 1: TrustLink as Primary Cranker (Now → TBD)

- TrustLink deploys and operates cranker nodes on high-performance infrastructure
- TrustLink funds or partners with firms to fund token-specific vaults
- Users experience fast, reliable settlement from day one
- Stablecoin issuers can participate as LPs (see [LIQUIDITY.md](./LIQUIDITY.md))

### Phase 2: Open Operator Network (TBD → Future)

As the network proves itself with growing volume:

- Additional verified operators are welcomed
- Firms can deploy their own cranker nodes
- Competition improves resilience and reduces settlement times
- LP yields potentially increase due to greater vault availability

### How to Position for Phase 2

If you're interested in running a cranker when the network opens:

1. **Start as an LP** — Fund a vault, earn yields, understand the system
2. **Build infrastructure** — Set up a server, configure the cranker daemon
3. **Engage with TrustLink** — Join Discord, express interest, get updates
4. **Monitor network growth** — Track volume, vault utilization, and operator demand

---

## Technical Requirements

### Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 4 cores | 8+ cores |
| RAM | 8 GB | 16+ GB |
| Storage | 100 GB SSD | 256 GB+ NVMe SSD |
| Network | 100 Mbps | 1 Gbps |
| Uptime | 99% | 99.9% |

### Software Requirements

- **Node.js 20+** — Runtime for the cranker daemon
- **Redis** — State management and caching
- **Solana CLI** — Blockchain interaction
- **tsn-cranker-sdk** — TrustLink's operator SDK

### Network Requirements

- **Static IP** — For reliable node discovery
- **Firewall** — Allow incoming connections on specified ports
- **DNS** — Optional, for human-readable node addresses

---

## Setting Up Your Cranker Node

### Step 1: Install Dependencies

```bash
# Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Redis
sudo apt-get install redis-server
sudo systemctl enable redis

# Install Solana CLI
sh -c "$(curl -sSfL "https://release.solana.com/stable/install.sh")"
```

### Step 2: Clone and Configure SDK

```bash
# Clone the repository
git clone https://github.com/trustlink/trustlink-pay.git
cd trustlink-pay/tsn-cranker-sdk
npm install

# Configure environment
cat > .env << EOF
WALLET_PRIVATE_KEY=your_base58_private_key
REDIS_URL=redis://localhost:6379
VERIFIER_PDA=your_verifier_pda_address
TSN_PROGRAM_ID=your_tsn_program_id
NETWORK=devnet
LOG_LEVEL=info
EOF
```

### Step 3: Register Your Cranker

Before running, you must register as a verified cranker:

```bash
npm run register \
  -- --wallet-key "$WALLET_PRIVATE_KEY" \
  --network devnet
```

Registration requires:
- Valid Solana wallet
- Sufficient SOL for registration fees
- Agreement to operator terms

### Step 4: Fund Your Vault

Crankers need access to vault liquidity to front payouts. See [LIQUIDITY.md](./LIQUIDITY.md) for vault funding details.

### Step 5: Start Your Node

```bash
# Start the cranker daemon
npm run cranker start

# Check status
npm run cranker status

# View metrics
npm run cranker stats
```

### Step 6: Monitor Performance

Access the dashboard at `http://localhost:3002/dashboard` to view:

- Processed intents (payments executed)
- Pending intents (awaiting lease)
- Reimbursed amounts (epoch settlements)
- Error rates and latency
- AI protection alerts
- Cranker jail status

---

## Fraud Protection for Crankers

TSN Mempool includes fraud protection that monitors all cranker operations. The system is designed to detect malicious behavior without monitoring normal operator activity.

### Monitoring of Cranker Operations

| Operation | Fraud Protection | Notes |
|-----------|------------------|-------|
| Lease acquisition | Fraud detection | Detects front-running patterns |
| Payout execution | Proof verification | Validates amounts and signatures |
| Proof submission | Settlement protection | Prevents double-spend attempts |
| Epoch reimbursement | Anomaly detection | Guards against manipulation |

### Cranker Jail System

The fraud protection cranker jail system monitors crankers for malicious behavior:

```
Trust Score: 1.0 (100%)
       │
       ▼ Violation detected
Trust Score: 0.9
       │
       ▼ Violation detected
Trust Score: 0.8
       │
       ▼ (trust < 0.3) OR (violations >= 3)
       ▼
    JAILED (1 hour minimum)
       │
       ▼ After jail period
    RELEASED (trust reset to 0.5)
       │
       ▼ Additional violations
    BANNED (permanent)
```

### Jail Reasons & Trust Impact

| Reason | Severity | Trust Impact |
|--------|----------|--------------|
| Fraudulent proofs | Critical | -20% per violation |
| Payout manipulation | High | -15% per violation |
| Proof withholding | High | -15% per violation |
| Front-running | Medium | -12% per violation |
| Failed obligations | Low | -10% per violation |
| Sybil attack | Critical | -20% per violation |

### Avoiding Jail

- Submit valid proofs for every payout
- Never manipulate payout amounts
- Respond within epoch timeframes
- Don't engage in front-running
- Maintain consistent operation patterns

---

## Cranker Commands Reference

| Command | Description |
|---------|-------------|
| `start` | Begin processing payment intents |
| `stop` | Graceful shutdown |
| `status` | Check node health and connectivity |
| `stats` | View performance metrics |
| `pause` | Pause intent processing (maintenance) |
| `resume` | Resume after pause |

---

## Understanding Execution Leases

### What is a Lease?

An execution lease is an exclusive right to execute a specific payment within an epoch. Only one cranker can hold a lease for a payment at any time.

### Lease Acquisition

```typescript
// Monitoring for lease opportunities
while (true) {
  const intents = await mempool.getPendingIntents();
  for (const intent of intents) {
    if (!intent.hasLease) {
      const acquired = await tryAcquireLease(intent.id);
      if (acquired) {
        await executePayment(intent);
      }
    }
  }
  await sleep(100); // Poll interval
}
```

### Lease Exclusivity

- Only registered/verified crankers can acquire leases
- Lease state is atomic — prevents double execution
- Failed lease attempts indicate competition (good for network health)

---

## Epoch Settlement: How You Get Paid Back

Crankers front payouts from vault liquidity. At epoch close, the Mother Escrow reimburses crankers from sender escrow funds.

### Epoch Cycle (Currently ~7 Hours)

1. **Payment Executed** — Cranker pays recipient from vault
2. **Proof Submitted** — Cranker submits on-chain proof
3. **Epoch Closes** — Mother Escrow processes reimbursements
4. **Vault Replenished** — Cranker's vault is credited for reimbursement
5. **Fees Distributed** — Settlement fees distributed per split

### Reimbursement Flow

```
Sender Escrow → Mother Escrow → Cranker Vault → (Fee Split Applied)
                              ↓
                    87% to LP depositors
                    5% to Cranker (you)
                    8% to Protocol Treasury
```

### Managing Capital at Risk

| Factor | Impact |
|--------|--------|
| Vault Size | Larger vault = more lease capacity |
| Epoch Length | Longer epochs = more capital at risk between reimbursements |
| Payment Volume | Higher volume = faster capital turnover |
| Network Latency | Slower proof submission = delayed reimbursement |

**Tip**: Monitor your vault balance and epoch timing. A depleted vault means missed lease opportunities.

---

## Troubleshooting

### "Unable to acquire lease"

**Cause**: Another cranker was faster
**Solutions**:
- Increase monitoring frequency (reduce poll interval)
- Optimize network latency to mempool
- Accept that some intents will be competitive

### "Insufficient vault funds"

**Cause**: Vault balance is too low to front payout
**Solutions**:
- Check LP depositor activity
- Add more liquidity to vault
- Wait for epoch reimbursement

### "Verifier funds low"

**Cause**: Verifier PDA has insufficient SOL for account creation
**Solutions**:
- Contact TrustLink to top up verifier PDA
- If you're a registered operator, fund your own verifier

### "Redis connection failed"

**Cause**: Redis server not running or unreachable
**Solutions**:
```bash
# Check Redis status
sudo systemctl status redis

# Restart Redis
sudo systemctl restart redis

# Verify REDIS_URL in environment
echo $REDIS_URL
```

### "Proof submission failed"

**Cause**: Network issue or epoch state inconsistency
**Solutions**:
- Check Solana network status
- Verify your wallet has sufficient SOL for transaction fees
- Review cranker daemon logs for specific error

---

## Best Practices

### Infrastructure

- **Run redundant nodes** — Multiple cranker instances improve reliability
- **Use load balancers** — Distribute intent monitoring across instances
- **Monitor health continuously** — Set up alerts for node downtime
- **Keep software updated** — Update cranker SDK when new versions release

### Capital Management

- **Maintain vault buffer** — Keep 20% extra liquidity above expected needs
- **Monitor epoch timing** — Replenish vault before epoch close
- **Track utilization** — Adjust vault size based on lease demand

### Security

- **Protect private keys** — Use hardware wallets or secure key management
- **Rotate keys periodically** — Regular key rotation reduces risk
- **Monitor for unauthorized access** — Review access logs

---

## Getting Involved

### As a Stablecoin Issuer

If you want your token to be the preferred settlement option:

1. **Fund a vault** — Provide liquidity for your token
2. **Run a cranker** — Ensure fast execution for your token's payments
3. **Promote usage** — Users follow liquidity and speed

### As a Liquidity Provider

If you want to earn yields without running infrastructure:

- See [LIQUIDITY.md](./LIQUIDITY.md) for vault funding instructions
- Your capital enables cranker operators to execute payments
- You earn 87% of settlement fees automatically

### Partnership Inquiries

For vault funding partnerships, cranker operator agreements, or technical discussions:

- **Email**: [partnerships@trustlink.pay](mailto:partnerships@trustlink.pay)
- **Discord**: [Join our community](https://discord.gg/trustlink)
- **Twitter**: [@TrustLinkPay](https://twitter.com/TrustLinkPay)

---

## Related Documentation

- [OPERATOR.md](./OPERATOR.md) — Additional technical setup details
- [EPOCH-SETTLEMENT.md](./EPOCH-SETTLEMENT.md) — Deep dive into epoch mechanics
- [LIQUIDITY.md](./LIQUIDITY.md) — Vault funding and LP rewards
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture overview