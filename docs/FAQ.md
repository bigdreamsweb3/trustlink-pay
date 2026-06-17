# TrustLink Pay FAQ

## General

### What is TrustLink Pay?

TrustLink Pay is a private stablecoin payment system on Solana. Users send to 10-digit Transfer Identity Numbers. TSN settles value through cranker-routed vault flows.

### What is a TIN?

A TIN is a 10-digit Transfer Identity Number. It is the user-facing receive identity for TrustLink Pay and future wallet integrations.

### Is TrustLink Pay phone-number based?

No. The protocol identity is the TIN.

Phone numbers and WhatsApp can support notifications, authentication, and optional linking. The primary payment identity is the TIN.

### Which tokens are supported?

Approved stablecoins first, with broader SPL asset support planned through allowlisted settlement routes.

---

## Privacy

### How does TSN provide privacy?

TSN separates the sender-side escrow path from the recipient-side payout path.

```text
sender authorization -> cranker-sponsored escrow -> vault payout -> proof
```

The payment is on Solana, but the normal wallet view does not expose a direct sender-to-recipient transfer.

### Is TrustLink anonymous?

No. TrustLink is privacy-preserving, not anonymous. Settlement can be verified through transaction hashes, vault state, cranker records, and mempool proof records.

---

## Integration

### Can another wallet use TINS?

Yes. A wallet can use TINS as a receive identity layer. A user can share a TIN instead of a wallet address.

### Can another app use TSN?

Yes. Apps should integrate through the SDK and avoid manually building TSN transactions.

### Do I need permission to build on TINS or TSN?

No. The goal is open protocol infrastructure.

---

## Settlement

### What does escrowed mean?

Escrowed means the cranker has verified the work and funds have moved into the TSN escrow or vault path.

### What if a claim fails?

For the sender, the payment remains escrowed. For the recipient, the claim may be retryable depending on the current state.

### What is a cranker?

A cranker is a verified settlement operator that validates work, sponsors escrow, executes payout, and records proof.
