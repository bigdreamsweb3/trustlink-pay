# TrustLink Security

Security architecture for TrustLink Pay, TINS, and TSN Mempool AI Protection.

## Table of Contents

1. [Core Principles](#core-principles)
2. [Threat Model](#threat-model)
3. [Attack Mitigations](#attack-mitigations)
4. [AI Protection Security](#ai-protection-security)
5. [Privacy Model](#privacy-model)

---

## Core Principles

### 1. Main Wallet Never On-Chain

```
✓ Stored: privacy_pubkey (derived key)
✗ NEVER: main wallet address
✗ NEVER: private keys
```

### 2. Derived Keys Only

The privacy key shown on-chain is **derived** from main wallet:

```
Main Wallet (OFF-CHAIN)
       │
       ▼ BIP-44 derivation
privacy_pubkey (ON-CHAIN, visible)
       │
       ▼ Can rotate anytime
new privacy_pubkey (ON-CHAIN)
```

### 3. Multi-Sig Recovery

Changing your privacy key requires **2 of 3** recovery wallets.

---

## Threat Model

| Threat | What Happens | Mitigation |
|--------|--------------|------------|
| Wallet stolen | Hacker changes TIN to receive funds | Need 2 recovery wallets to rotate |
| Main wallet exposed | Main wallet visible on-chain | Never stored on-chain |
| TIN enumeration | Hacker scans all TINs | HMAC-based non-sequential TINs |
| Mass TIN creation | Spam attacks | Rate limiting (100/hour) |
| Replay attack | Old transaction replayed | Nonce increments |
| Social engineering | User tricked into sending | Display name verification |

---

## Attack Mitigations

### Wallet Theft

```
WITHOUT MULTI-SIG:
  Hacker steals wallet
  → Hacker changes TIN → Hacker receives ALL funds
  → User doesn't know → Funds gone

WITH MULTI-SIG:
  Hacker steals wallet
  → Hacker initiates rotation
  → Need 2nd recovery wallet → BLOCKED
  → User notified → BLOCKED
```

### Display Name Verification

Before sending, user sees:
```
Confirm: Send 100 USDC to Daniel Ochieng (TIN-1234-5678)?
```

Not: `Send to 7xK...abc123 (unverified)`

### TIN Enumeration Prevention

```
SEQUENTIAL (BAD):
  TIN-0001-0001, TIN-0001-0002, TIN-0001-0003...
  → Easy to predict → Easy to scan

ENTROPY-BASED (GOOD):
  TIN = hash(owner + entropy + slot) → pseudo-random
  → Can't predict → Can't enumerate
```

### Rate Limiting

```
Per hour per owner: Max 100 TINs
Per block: Max 10 TINs
```

---

## AI Protection Security

TSN Mempool includes AI-powered fraud detection and protection as a core security feature.

### Protection Components

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| **Fraud Detector** | Detect fraudulent patterns | Duplicate detection, replay prevention, velocity analysis |
| **Anomaly Detector** | Statistical anomaly detection | Z-score analysis, timing patterns, state validation |
| **Behavioral Analyzer** | User behavior tracking | Pattern recognition, splitting/rushing/batching detection |
| **Risk Scorer** | Real-time risk assessment | Multi-factor scoring, threshold alerts |
| **Proof Verifier** | Payment proof validation | Amount matching, signature verification, timestamp checks |
| **Quote Validator** | Fee quote protection | Stale quote detection, inflation monitoring |
| **Settlement Protector** | Epoch settlement guard | Double-spend prevention, griefing detection |
| **Cranker Jail** | Cranker enforcement | Reputation tracking, automatic jail for violations |

### AI Protection Threats & Mitigations

| Threat | AI Detection | Mitigation |
|--------|--------------|------------|
| Duplicate intent submission | Fraud detector | Block payment ID reuse |
| Replay attacks | Proof verifier | Transaction signature validation |
| Sybil attacks | Behavioral analyzer | Velocity and pattern monitoring |
| Payout manipulation | Proof verifier | Amount tolerance validation (0.1%) |
| Quote spoofing | Quote validator | Historical fee comparison |
| Epoch griefing | Settlement protector | Last-minute submission detection |
| Cranker misconduct | Cranker jail | Trust score tracking, automatic jail |
| Velocity spikes | Anomaly detector | Z-score analysis, rate limiting |

### Guardian Decision Flow

```
Intent Submission
       │
       ▼
┌──────────────────┐
│ Fraud Detection │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Risk Scoring    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Anomaly Detection│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Behavioral      │
│    Analysis      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Guardian Decision│
│ Allow/Flag/Block │
└──────────────────┘
```

### Cranker Jail System

The Cranker Jail system provides automated enforcement for malicious cranker behavior:

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
    JAILED
    1 hour minimum
       │
       ▼ After jail period
    RELEASED (trust reset to 0.5)
       │
       ▼ Additional violations
    BANNED (permanent)
```

### Investor Security Benefits

- **Automated Protection**: Every transaction screened without manual intervention
- **Real-time Defense**: Threats detected and blocked in milliseconds
- **Reputation System**: Crankers incentivized to behave correctly
- **Protocol Integrity**: AI ensures TSN operates with verifiable security

---

## Privacy Model

### What Is Public (On-Chain)

| Data | Who Sees | Why |
|------|---------|-----|
| TIN | Everyone | For lookup |
| display_name | Everyone | Anti-scam verification |
| privacy_pubkey | Everyone | For escrow routing |
| recovery_wallets | NO ONE | Private to owner |

### What Is Private (Off-Chain)

| Data | Where | Who Sees |
|------|-------|----------|
| Main wallet | User's device | NO ONE |
| Private key | User's device | NO ONE |
| Recovery wallets | User's device | NO ONE |

### What Can Be Viewed

The public can see:
- TIN → display name ✓
- TIN → privacy key ✓

The public CANNOT see:
- TIN → main wallet ✗
- TIN → recovery wallets ✗
- TIN → private key ✗

---

## Security Checklist

For production, ensure:

- [x] Main wallet never stored on-chain
- [x] Privacy key derived (BIP-44)
- [x] Display name for verification
- [x] Multi-sig recovery walls
- [x] 24hr rotation cooldown
- [x] Nonce for replay protection
- [x] Rate limiting
- [x] Anti-enumeration TINs
- [x] Team fees (prevents abuse)

---

## Reporting Security Issues

Found a security issue?

**Email**: security@[domain]
**GitHub**: Open issue (private)

Include:
- Description
- Steps to reproduce
- Potential impact