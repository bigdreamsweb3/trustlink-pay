# Developer Notes - TrustLink Pay

## For the Developer

This document is for you - the person building and maintaining TrustLink Pay. It covers security considerations, known attack surfaces, and how to address them.

---

## Security Considerations

### 1. Payment Intent Race Conditions

**Risk**: Multiple Crankers claiming same payment
**Status**: Mitigated via lease exclusivity
**Fix**: Ensure lease state is atomic - only one Cranker acquires lease per intent

### 2. Replay Attacks on Claims

**Risk**: Reusing claim signatures
**Status**: Nonce tracked per payment
**Fix**: Verify nonce not used before processing

### 3. Front-Running Payment Intents

**Risk**: MEV extractors watching mempool
**Status**: Cranker-only submission
**Fix**: Only registered Crankers can submit intents on-chain

### 4. Verifier PDA Drain

**Risk**: Insufficient verifier funds for account creation
**Status**: Checked before send
**Fix**: Monitor verifier balance, top up before exhaustion

### 5. Escrow Expiration Without Refund

**Risk**: Sender funds stuck after expiration
**Status**: Refund path exists
**Fix**: Call refund before expiration window closes

### 6. Cranker Reimbursement Failure

**Risk**: Epoch miss = no reimbursement
**Status**: Proof required for reimbursement
**Fix**: Ensure proof submission is reliable

### 7. Phone Number hijacking

**Risk**: SIM swap or phone takeover
**Status**: WhatsApp verification + PIN
**Fix**: Require 2FA, rate limit OTPs

### 8. Wallet Connection Theft

**Risk**: Session hijacking
**Status**: Short-lived sessions, PIN verification
**Fix**: Regular session rotation

---

## Known Issues to Address

1. **Backend Turbopack build**: Next.js build fails with re-export files in "use server". Consider restructuring `solana.ts`:
   - Move re-exports to separate non-server files
   - Or use direct function calls instead of re-exports

2. **Test coverage**: No comprehensive test suite. Prioritize:
   - Payment flow tests
   - Cranker lease tests
   - Settlement tests

3. **Monitoring**: Need production alerting for:
   - Failed claims
   - Expired payments
   - Verifier balance low

---

## How Users Would Use This Daily

### Use Cases

**Remittances**: Send money home using just a phone number
**Merchant Payments**: Receive payments without sharing wallet
**Bill Pay**: Pay services with stablecoin, recipient gets Naira/cedi/cash

### Why They'd Choose TrustLink

1. **Familiar**: Use phone, not wallet address
2. **Fast**: Direct notification, claim in minutes
3. **Private**: Sender doesn't see recipient wallet
4. **Low Cost**: Fraction of Western Union/MoneyGram
5. **Transparent**: Know exactly what recipient gets

### Growth Strategy

1. **P2P**: User-to-user referrals
2. **Merchants**: Small business adoption
3. **API**: Let other apps build on TSN
4. **Cash Out**: Partner with local exchanges

---

## Protocol Economics

### Sender Pays

- Network fee (Solana)
- Protocol fee (1% default)

### Cranker Earns

- Execution from vault liquidity
- Reimbursement at epoch

### LP Earns

- 87% of settlement fees

### Token Economics

- No token required for payments
- Protocol funded via treasury

---

## Architecture Summary

```
User → Phone/TIN → Backend → Mempool → Cranker → Vault
                              ↓                   
                          Escrow ← Reimbursement
```

1. User sends to phone
2. Backend resolves identity
3. Funds lock in escrow
4. Mempool publishes intent
5. Cranker pays recipient
6. Proof → Reimbursement

For questions: security@trustlink.pay