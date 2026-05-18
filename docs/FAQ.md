# Developer FAQ

## General

### What is TrustLink Pay?

A payment protocol letting users send stablecoins to phone numbers. Settlement is private through TSN.

### Which tokens are supported?

USDC initially. SPL token support expanding.

### Is this live on mainnet?

Protocol is devnet-tested. Launch timing TBA.

## Integration

### How do I integrate?

See [Integration Guide](./INTEGRATION.md). Basic flow:

1. Create payment intent
2. Get user approval
3. Handle webhooks

### Do I need approval to integrate?

No. TINS and TSN are open protocols. Build freely.

### Can I use my own UI?

Yes. The SDK provides core functions. Frontend is yours.

## Settlement

### How does TSN provide privacy?

Settlement splits sender and recipient wallets:

- Sender → escrow (visible on chain)
- Cranker → vault → recipient
- No direct wallet link

### What's the fee split?

87% LPs, 8% protocol, 5% Cranker

### How do I become a Cranker?

See [Operator Guide](./OPERATOR.md)

## Technical

### Why Solana?

- Low fees (<$0.001 typical)
- High throughput
- Phone-friendly UX

### Can I run my own indexer?

Yes. TSN mempool is public. Build freely.

### Is there rate limiting?

API has standard rate limits. Contact for higher.