# TrustLink Pay FAQ

## General

### What is TrustLink Pay?

TrustLink Pay is a private stablecoin payment system on Solana. Users send to 10-digit Transfer Identity Numbers, and TSN settles value through cranker-routed vault flows.

### What is a TIN?

A TIN is a 10-digit Transfer Identity Number. It is the user-facing receive identity for TrustLink Pay and future wallet integrations.

### Is TrustLink Pay phone-number based?

No. The protocol narrative is TIN-first.

Phone numbers and WhatsApp can support notifications, authentication, optional linking, and future discovery. The primary payment identity is the TIN.

### Which tokens are supported?

Approved stablecoins first, with broader SPL asset support planned through allowlisted settlement routes.

---

## Privacy

### How does TSN provide privacy?

TSN separates the sender-side escrow path from the recipient-side payout path.

```text
sender authorization -> cranker-sponsored escrow -> vault payout -> proof
```

The payment is still on Solana, but the normal user wallet view does not expose a clean direct sender-to-recipient transfer.

### Is TrustLink anonymous?

No. TrustLink is privacy-preserving, not accountability-free. Settlement can still be verified through transaction hashes, vault state, cranker records, and mempool proof records.

---

## Integration

### Can another wallet use TINS?

Yes. A wallet can use TINS as a privacy-friendly receive identity layer. A user can share a TIN instead of a raw wallet address.

### Can another app use TSN?

Yes. Apps should integrate through the SDK and avoid manually building TSN transactions.

### Do I need permission to build on TINS or TSN?

No. The goal is open protocol infrastructure.

---

## Settlement

### What does escrowed mean?

Escrowed means the cranker has verified the work and funds have moved into the TSN escrow/vault path.

### What if claim fails?

For the sender, the payment remains escrowed. For the recipient, the claim may be retryable depending on current state.

### What is a cranker?

A cranker is a verified settlement operator that validates work, sponsors escrow, executes payout, and records proof.

### What is claim credit?

Claim credit is earned when a cranker performs useful escrow work. It gates access to claim execution so the network prioritizes payment-intent processing before payout work.
