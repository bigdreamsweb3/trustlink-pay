# AI-Powered Protection for TSN Mempool

> **Security Feature Summary**: TSN Mempool includes AI-powered fraud detection and protection that secures all transfers on the protocol. This document covers the complete AI protection architecture, detection mechanisms, and integration patterns.

---

## Overview

The TSN Mempool AI Protection System is a multi-layered defense mechanism that analyzes every payment intent, claim request, and cranker operation in real-time. It combines statistical anomaly detection, behavioral analysis, and reputation scoring to prevent fraud and manipulation.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TSN Mempool AI Protection                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│  │ Fraud    │    │ Anomaly  │    │Behavioral│    │  Risk    │             │
│  │ Detector │    │ Detector │    │ Analyzer │    │  Scorer  │             │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘             │
│       │               │               │               │                   │
│       └───────────────┴───────────────┴───────────────┘                   │
│                           │                                                 │
│                    ┌──────┴──────┐                                          │
│                    │   Mempool   │                                          │
│                    │   Guardian   │                                          │
│                    └──────┬──────┘                                          │
│                           │                                                 │
│       ┌───────────────────┼───────────────────┐                           │
│       ▼                   ▼                   ▼                           │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                            │
│  │ Proof    │    │ Quote    │    │Settlement│                            │
│  │ Verifier │    │Validator │    │Protector │                            │
│  └──────────┘    └──────────┘    └──────────┘                            │
│                                                                             │
│                    ┌──────────────┐                                         │
│                    │ Cranker Jail │                                         │
│                    └──────────────┘                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Protection Components

### 1. Fraud Detection (`fraud-detector.ts`)

Detects fraudulent patterns before operations enter the mempool.

**Detection Capabilities:**
- **Duplicate Intent Detection**: Prevents same payment ID from being registered twice
- **Replay Attack Detection**: Identifies attempts to re-submit known transactions
- **Sybil Attack Detection**: Detects coordinated attempts to manipulate network
- **Payout Manipulation Detection**: Validates claimed amounts match expected values
- **Velocity Analysis**: Tracks transaction frequency per recipient
- **Blacklist Checking**: Validates against known fraudster wallets

**Fraud Indicators:**
```typescript
type FraudIndicator =
  | "duplicate_intent"
  | "replay_attack"
  | "sybil_attempt"
  | "coordinated_claim"
  | "payout_manipulation"
  | "front_running"
  | "settlement_manipulation"
  | "amount_threshold_breach"
  | "velocity_exceeded"
  | "blacklisted_recipient";
```

**Usage:**
```typescript
import { createMempoolFraudDetector } from "./ai/fraud-detector";

const fraudDetector = createMempoolFraudDetector();

const report = fraudDetector.analyzeIntent({
  paymentId: "pay_123",
  amount: 1000000,
  recipientHash: "recipient_wallet_hash"
});

if (report.detected) {
  console.log(`Fraud detected: ${report.indicators}`);
}
```

---

### 2. Anomaly Detection (`anomaly-detector.ts`)

Uses statistical analysis to identify unusual patterns.

**Detection Capabilities:**
- **Velocity Spike Detection**: Z-score analysis of transaction frequency
- **Amount Outlier Detection**: Statistical deviation from normal amounts
- **Timing Pattern Analysis**: Detects bot-like regularity in transactions
- **State Transition Validation**: Ensures only valid state machine transitions
- **Cranker Deviation Detection**: Monitors cranker response time patterns

**Anomaly Types:**
```typescript
type AnomalyType =
  | "velocity_spike"
  | "amount_outlier"
  | "timing_pattern"
  | "spatial_cluster"
  | "state_transition"
  | "cranker_deviation";
```

**Statistical Methods:**
- Z-score analysis (configurable threshold, default 3σ)
- IQR (Interquartile Range) for outlier detection
- Coefficient of Variation for timing regularity
- Time-series windowing for pattern detection

**Usage:**
```typescript
import { createMempoolAnomalyDetector } from "./ai/anomaly-detector";

const anomalyDetector = createMempoolAnomalyDetector();

// Detect velocity anomaly
const velocityAnomaly = anomalyDetector.detectVelocityAnomaly(
  "wallet_hash",
  150 // current count
);

// Detect amount outlier
const amountAnomaly = anomalyDetector.detectAmountAnomaly(500000000);

// Detect timing pattern (bot activity)
const timingAnomaly = anomalyDetector.detectTimingAnomaly();
```

---

### 3. Behavioral Analysis (`behavioral-analyzer.ts`)

Tracks and analyzes wallet behavior patterns over time.

**Behavior Patterns:**
```typescript
type BehaviorPattern = 
  | "normal"      // Expected behavior
  | "rushing"     // Rapid-fire transactions
  | "splitting"   // Many small transactions (structuring)
  | "batching"    // Regular intervals (possible bot)
  | "circular";   // Circular payment flow
```

**Profile Data:**
- Transaction count and history
- Average transaction amount
- Preferred transaction times
- Autoclaim preference ratio
- First/last seen timestamps
- Risk score calculation

**Detection:**
```typescript
import { createMempoolBehavioralAnalyzer } from "./ai/behavioral-analyzer";

const analyzer = createMempoolBehavioralAnalyzer();

// Record new intent
analyzer.recordIntent("wallet_hash", 1000000, false);

// Check for suspicious patterns
const result = analyzer.detectSuspiciousIntent({
  walletHash: "wallet_hash",
  amount: 500000000
});

if (result.suspicious) {
  console.log(`Suspicious: ${result.reasons.join(", ")}`);
}
```

---

### 4. Risk Scoring (`risk-scorer.ts`)

Real-time risk assessment using multiple signal analysis.

**Risk Factors:**
| Factor | Weight | Description |
|--------|--------|-------------|
| Velocity | 25% | Transaction frequency and patterns |
| Amount | 20% | Transaction size relative to normal |
| Time Pattern | 15% | Timing regularity and anomalies |
| Wallet Reputation | 15% | Historical behavior score |
| Device Fingerprint | 10% | Device/IP reputation |
| Geographic | 5% | Geographic signals |
| Historical | 10% | Past fraud patterns |

**Risk Levels:**
```typescript
type RiskLevel = "minimal" | "low" | "medium" | "high" | "critical";

interface RiskScore {
  score: number;        // 0-100
  level: RiskLevel;
  factors: RiskFactor[];
  recommendations: string[];
}
```

**Usage:**
```typescript
import { createMempoolRiskScorer } from "./ai/risk-scorer";

const riskScorer = createMempoolRiskScorer();

const riskScore = riskScorer.scoreIntent({
  paymentId: "pay_123",
  amount: 100000000,
  recipientHash: "wallet_hash"
});

if (riskScore.level === "high" || riskScore.level === "critical") {
  console.log(`High risk: ${riskScore.recommendations}`);
}
```

---

### 5. Proof Verification (`proof-verifier.ts`)

Validates proof of payment submissions to prevent fraud.

**Verification Checks:**
- Double-submission detection (replay attack prevention)
- Payout amount validation (0.1% tolerance)
- Transaction signature format validation
- Timestamp sanity (not future, not stale)
- Cranker authorization verification

**Usage:**
```typescript
import { createMempoolProofVerifier } from "./ai/proof-verifier";

const verifier = createMempoolProofVerifier();

const result = verifier.verifyProof({
  intentId: "intent_123",
  crankerPubkey: "cranker_wallet",
  payoutTxSig: "transaction_signature_64_chars",
  payoutAmount: 1000000,
  timestamp: Date.now()
}, {
  amount: 1000500, // Expected amount
  recipientHash: "recipient"
});

if (!result.valid) {
  console.log(`Invalid proof: ${result.discrepancies.join(", ")}`);
}
```

---

### 6. Quote Validation (`quote-validator.ts`)

Prevents quote manipulation and fee spoofing attacks.

**Validation Checks:**
- Stale quote detection (5-minute max age)
- Amount mismatch validation
- Fee inflation detection (50%+ above historical)
- Fee component verification
- Expiration timestamp validation

**Quote Manipulation Types:**
```typescript
type QuoteManipulationType = 
  | "spoofing"       // False quote information
  | "stale_quote"    // Expired quote reuse
  | "amount_mismatch" // Quote doesn't match request
  | "fee_inflation";  // Excessive fees
```

**Usage:**
```typescript
import { createMempoolQuoteValidator } from "./ai/quote-validator";

const validator = createMempoolQuoteValidator();

const result = validator.validateQuote({
  senderFee: 1000,
  claimFee: 500,
  networkFeeEstimate: 100,
  totalFee: 1600,
  timestamp: Date.now(),
  expiresAt: Date.now() + 300000,
  tokenMint: "usdc_mint"
}, {
  amount: 100000000,
  tokenMint: "usdc_mint",
  recipientHash: "recipient"
});
```

---

### 7. Settlement Protection (`settlement-protector.ts`)

Guards epoch settlement operations from manipulation.

**Protection Capabilities:**
- Double-spend detection for same intent
- Timestamp manipulation detection
- Epoch griefing prevention (last-minute submissions)
- Reimbursement amount verification
- Fee distribution anomaly detection

**Settlement Manipulation Types:**
```typescript
type SettlementManipulationType =
  | "double_spend_attempt"
  | "epoch_griefing"
  | "reimbursement_manipulation"
  | "fee_distribution_anomaly"
  | "timestamp_manipulation";
```

**Usage:**
```typescript
import { createMempoolSettlementProtector } from "./ai/settlement-protector";

const protector = createMempoolSettlementProtector();

const result = protector.validateProof({
  intentId: "intent_123",
  crankerPubkey: "cranker_wallet",
  payoutTxSig: "tx_signature",
  payoutAmount: 1000000,
  proofTimestamp: Date.now()
}, epochId);

// Validate epoch settlement
const settlementResult = protector.validateEpochSettlement({
  epochId: 42,
  timestamp: Date.now(),
  totalReimbursements: 1000000000,
  crankerPayments: new Map([["cranker1", 50000000]]),
  lpDistribution: new Map([["lp1", 870000000]]),
  treasuryPayment: 80000000
});
```

---

### 8. Cranker Jail (`cranker-jail.ts`)

Reputation-based enforcement system for cranker operators.

**Cranker Status:**
```typescript
type CrankerStatus = "active" | "jailed" | "released" | "banned";

interface CrankerJailRecord {
  crankerPubkey: string;
  status: CrankerStatus;
  jailedAt: number;
  releaseAt: number | null;
  reason: JailReason;
  violations: number;
  trustScore: number;
  totalOperations: number;
  successfulOperations: number;
}
```

**Jail Reasons:**
```typescript
type JailReason =
  | "fraudulent_proofs"
  | "payout_manipulation"
  | "failed_obligations"
  | "front_running"
  | "proof_withholding"
  | "sybil_attack";
```

**Jail Configuration:**
```typescript
const DEFAULT_JAIL_CONFIG = {
  trustScoreThreshold: 0.3,    // Below this = jail
  jailDurationMs: 3600000,      // 1 hour minimum
  maxViolations: 3,             // 3 violations = jail
  gracePeriodMs: 86400000       // 24 hours before enforcement
};
```

**Usage:**
```typescript
import { createMempoolCrankerJail } from "./ai/cranker-jail";

const jail = createMempoolCrankerJail();

// Check if cranker can operate
const { allowed, reason } = jail.canOperate("cranker_wallet");

if (!allowed) {
  console.log(`Cranker blocked: ${reason}`);
}

// Record operation results
jail.recordSuccess("cranker_wallet");
jail.recordFailure("cranker_wallet", "payout_manipulation");

// Get cranker status
const status = jail.getStatus("cranker_wallet");
console.log(`Trust score: ${status.trustScore}`);
```

---

## Mempool Guardian - Unified Protection Layer

The `MempoolGuardian` combines all protection components into a single interface.

```typescript
import { createMempoolGuardian } from "./ai/mempool-guardian";

const guardian = createMempoolGuardian({
  fraudThreshold: 0.5,
  riskThreshold: 70,
  autoBlockCritical: true
});
```

### Screening Intent

```typescript
const result = guardian.screenIntent({
  paymentId: "pay_123",
  amount: 100000000,
  recipientHash: "recipient_wallet"
});

switch (result.decision) {
  case "block":
    console.log(`BLOCKED: ${result.blockReasons?.join(", ")}`);
    break;
  case "flag":
    console.log(`FLAGGED: Review required`);
    break;
  case "allow":
    console.log(`ALLOWED: Proceed with mempool admission`);
    break;
}
```

### Authorizing Cranker Operations

```typescript
const auth = guardian.authorizeCrankerOperation({
  crankerPubkey: "cranker_wallet",
  intentId: "intent_123",
  payoutAmount: 1000000
});

if (!auth.authorized) {
  console.log(`Operation denied: ${auth.reason}`);
}
```

---

## Configuration

### Default Configuration

```typescript
// Fraud Detection
const DEFAULT_FRAUD_CONFIG = {
  maxIntentsPerPaymentId: 1,
  intentTimeWindowMs: 60000,
  amountThreshold: 1000000000,  // $1000 USDC
  velocityWindowMs: 3600000,   // 1 hour
  maxVelocityPerWindow: 100,
  blacklistedWallets: new Set()
};

// Risk Scoring
const DEFAULT_RISK_CONFIG = {
  weights: {
    velocity: 0.25,
    amount: 0.20,
    timePattern: 0.15,
    walletReputation: 0.15,
    deviceFingerprint: 0.10,
    geographic: 0.05,
    historical: 0.10
  },
  thresholds: {
    minimal: 0,
    low: 20,
    medium: 40,
    high: 70
  }
};
```

### Custom Configuration

```typescript
const guardian = createMempoolGuardian({
  fraudThreshold: 0.7,
  riskThreshold: 80,
  autoBlockCritical: false
});

const fraudDetector = createMempoolFraudDetector({
  amountThreshold: 5000000000,  // $5000 USDC
  maxVelocityPerWindow: 200,
  blacklistedWallets: new Set(["known_fraudster"])
});
```

---

## Integration with Mempool

### Pre-Admission Flow

```
1. Client submits intent to /intents
2. Guardian.screenIntent() analyzes
3. Fraud detection checks duplicates/patterns
4. Risk scorer calculates risk score
5. Anomaly detector identifies statistical anomalies
6. Behavioral analyzer checks wallet history
7. Guardian makes decision: Allow / Flag / Block
8. If allowed, intent is stored in mempool
9. Results recorded for future analysis
```

### Request Validation Flow

```
1. Client submits claim request to /claim-requests
2. Guardian.screenClaimRequest() analyzes
3. Fraud detection checks recipient patterns
4. Risk scorer evaluates claim risk
5. Behavioral analyzer checks claim patterns
6. Guardian makes decision
7. If allowed, claim request stored
```

---

## Investor Benefits

### Security Guarantees

| Benefit | Description |
|---------|-------------|
| **Fraud Prevention** | ML-powered detection of payment fraud and manipulation |
| **Real-time Protection** | Every transaction screened before mempool admission |
| **Automated Enforcement** | Cranker jail system punishes malicious behavior |
| **Protocol Integrity** | Verifiable security through AI analysis |

### Risk Mitigation

| Risk | AI Protection |
|------|---------------|
| Payment Fraud | Fraud detection with duplicate/replay prevention |
| Payout Manipulation | Proof verification with amount validation |
| Quote Spoofing | Quote validation with historical analysis |
| Epoch Manipulation | Settlement protection with timestamp checks |
| Cranker Misconduct | Jail system with reputation tracking |

---

## Future Enhancements

- **ML Model Training**: Historical data for improved pattern recognition
- **Ensemble Detection**: Multiple AI models for enhanced accuracy
- **Real-time Dashboards**: Operator monitoring of protection metrics
- **Automatic Blacklist Updates**: Integration with threat intelligence feeds
- **Predictive Analytics**: Anticipate attack patterns before execution

---

## Related Documentation

- [SECURITY.md](SECURITY.md) - Security architecture overview
- [TSN.md](TSN.md) - TSN protocol specifications
- [CRANKER.md](CRANKER.md) - Cranker operation guide
- [EPOCH-SETTLEMENT.md](EPOCH-SETTLEMENT.md) - Epoch settlement details

---

**TSN Mempool AI Protection** — Securing transfers with intelligent threat detection.