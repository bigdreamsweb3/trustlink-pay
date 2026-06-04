# TrustLink Pay Developer Guide

This guide is for developers building on TrustLink Pay, TINS, and TSN.

TrustLink Pay is now documented as a TIN-first system:

```text
10-digit TIN -> TSN private settlement -> recipient payout
```

Phone and WhatsApp flows may exist in the app for notifications and optional linking, but integrations should treat the TIN as the primary payment identity.

---

## Integration Rules

### Use The SDK

Protocol-specific work belongs in the SDK.

Applications should not manually:

- derive TSN PDAs,
- assemble TSN instructions,
- build settlement transactions,
- serialize account layouts,
- reproduce cranker logic.

Applications should:

- collect user input,
- connect wallets,
- call SDK methods,
- request wallet signatures,
- display status.

### Keep TIN First

New integrations should ask for a TIN, not a phone number.

Good:

```text
recipientTin: "1000000008"
```

Avoid positioning this as the primary product:

```text
recipientPhone: "+234..."
```

Phone/social linking can be added later as optional discovery.

---

## Daily Use Cases

### Wallet Receive Privacy

A wallet can let users share a TIN instead of exposing a raw address. Payments route through TSN so the normal payment path does not reveal a simple sender-to-recipient wallet graph.

### Merchant Payments

A merchant can publish a TIN as its receive identity. Customers pay the TIN, while treasury wallets remain behind the settlement layer.

### Stablecoin Transfers

Users can send approved stablecoins to TINs with cranker-sponsored settlement and recipient payout.

### Future Payment PDA Flow

A future receive surface may let users generate payment PDAs. Funds entering that PDA can be detected and routed through TSN, then auto-claimed according to recipient settings.

---

## Security Considerations

| Risk | Mitigation |
| --- | --- |
| Address exposure | TIN-first receive identity and TSN settlement separation |
| Tampered mempool work | Cranker validates authorization and transaction structure |
| Replay attacks | Nonce and expiry in sender authorization |
| Competing claim execution | Claim credit and cranker coordination |
| Stuck escrow | Claim/retry surfaces and status tracking |
| Misleading UX | Sender view shows escrowed, recipient view shows claim state |

---

## Architecture Summary

```text
User enters TIN
SDK prepares TSN authorization
Sender signs authorization/co-signed settlement payload
Mempool stores pending work
Cranker verifies and sponsors escrow
Funds enter TSN vault path
Recipient claim work becomes available
Cranker executes payout
Proof is stored through tx hashes and mempool state
```

---

## Developer Checklist

- [ ] Display TIN as the payment identity.
- [ ] Do not expose raw wallet addresses as the normal receive flow.
- [ ] Use the TSN SDK for settlement construction.
- [ ] Use the TINS SDK for identity resolution.
- [ ] Show payment status as pending, escrowed, claiming, executed, canceled, or retryable.
- [ ] Keep phone/social linking optional and application-specific.

For questions: `security@trustlink.pay`
