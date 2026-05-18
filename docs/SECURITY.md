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

## Threat Model

| Threat | Mitigation |
| --- | --- |
| Wallet theft | PIN + WhatsApp authentication |
| Replay attacks | Nonce + expiration |
| Front-running | Cranker exclusivity (one lease) |
| Reentrancy | Check-effect-interaction pattern |
| Access control | RBAC + session tokens |

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