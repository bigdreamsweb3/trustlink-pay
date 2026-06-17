# TrustLink Pay Developer Guide

This guide is for developers building on TrustLink Pay, TINS, and TSN.

TrustLink Pay is a TIN-first system:

```
10-digit TIN -> TSN private settlement -> recipient payout
```

Phone and WhatsApp flows may exist in the app for notifications and optional linking, but integrations should treat the TIN as the primary payment identity.

---

## Integration Rules

### Use the SDK

Protocol-specific work belongs in the SDK. Applications should not:

- derive TSN account addresses,
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
```
recipientTin: "1000000008"
```

Phone or social linking can be added later as optional discovery.

---

## Example Use Cases

**Wallet Receive Privacy.** A wallet can let users share a TIN instead of exposing a raw wallet address. Payments route through TSN so the normal payment path does not reveal the sender-to-recipient wallet graph.

**Merchant Payments.** A merchant can publish a TIN as its receive identity. Customers pay the TIN, and the merchant's treasury wallets remain behind the settlement layer.

---

## Architecture Summary

```
User enters TIN
SDK prepares TSN authorization
Sender signs authorization or co-signed settlement payload
Mempool stores pending work
Cranker verifies and sponsors escrow
Funds enter TSN vault path
Recipient claim work becomes available
Cranker executes payout
Proof is stored through tx hashes and mempool state
```

---

## Security Considerations

| Risk | Mitigation |
| --- | --- |
| Address exposure | TIN-first receive identity and TSN settlement separation |
| Tampered mempool work | Cranker validates authorization and transaction structure |
| Replay attacks | Unique counter and expiry in sender authorization |
| Competing claim execution | Claim credit and cranker coordination |
| Stuck escrow | Claim or retry surfaces and status tracking |
| Misleading UX | Sender view shows escrowed, recipient view shows claim state |

---

## Developer Checklist

- [ ] Display TIN as the payment identity.
- [ ] Do not expose raw wallet addresses as the normal receive flow.
- [ ] Use the TSN SDK for settlement construction.
- [ ] Use the TINS SDK for identity resolution.
- [ ] Show payment status as pending, escrowed, claiming, executed, canceled, or retryable.
- [ ] Keep phone or social linking optional and application-specific.
