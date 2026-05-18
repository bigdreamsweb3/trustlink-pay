# TrustLink Pay Security Documentation

## Security Model

TrustLink Pay is designed with security as the foundation, not an afterthought.

## Core Properties

### Noncustodial

- Funds always held in user-controlled escrow
- Protocol never takes custody
- Smart contracts enforce release rules

### Per-Payment Isolation

- Each payment has unique escrow
- No shared state between payments
- Failure contained per payment

### Address Poisoning Prevention

- Users send to phone numbers, not addresses
- Backend resolves identity before locking
- No copy-paste wallet errors

### Wallet Rotation (Critical Security)

#### The Problem

If a user's old wallet is leaked/compromised:
- ❌ Hacker changes TIN to hacker's wallet
- ❌ Sender sends to TIN, funds go to hacker
- ❌ User doesn't know until funds disappear

#### Secure Rotation Protocol

**Requirement**: User must prove they control BOTH wallets.

```
1. INITIATE: User signs message with OLD wallet
   → "I want to rotate TIN-XXXX-XXXX to new wallet"
   
2. VERIFY: System verifies old wallet signed request
   
3. COOLDOWN: 24-72 hour delay before change activates
   → User gets notification via ALL linked channels
   
4. CONFIRM: User must CONFIRM via SEPARATE channel
   → Email, SMS, WhatsApp - pick any 2
   
5. ACTIVATE: After cooldown + confirmation
   → TIN now resolves to new privacy_pubkey
```

#### Anti-Hacker Protections

| Attack | Protection |
|--------|-----------|
| Hacker has old wallet | Need NEW wallet also to confirm |
| Hacker controls email | Need SMS/WhatsApp confirmation |
| Hacker social engineers | Cooldown delay gives time to notice |
| Silent change | Notification on ALL channels |
| Fast takeover | Min 24hr cooldown, max 72hr |

#### Migration Flow

```
[Old Wallet] → [Cooldown] → [Confirmation] → [New Privacy Key]
     │              │              │
     ▼              ▼              ▼
 Sign request   Wait + notify   Verify + activate
```

### Threat Model

| Threat | Mitigation |
| --- | --- |
| Wallet theft | PIN + WhatsApp authentication |
| Replay attacks | Nonce + expiration |
| Front-running | Cranker exclusivity (one lease) |
| Reentrancy | Check-effect-interaction pattern |
| Access control | RBAC + session tokens |
| **Silent wallet rotation** | Multi-wallets + cooldown + multi-channel confirm |

## Vulnerability Disclosure

Please report security vulnerabilities responsibly.

**Report**: security@trustlink.pay

## Audits

Protocol contracts should be audited before mainnet. Self-audit recommended:

```bash
cd tsn/protocol
anchor build
anchor test
```

## Smart Contract Security

The escrow program uses:

- CPI guards
- Signer validation
- Amount limits
- Time locks