# Integration Guide

This guide is for apps that want to use TrustLink Pay, TINS, or TSN.

## What Is This?

TrustLink Pay is built so other wallets and apps can use TIN identities and TSN settlement without rebuilding the protocol.

## Why Integrate

An app can let users receive payments through a TIN instead of exposing a wallet address.

An app can also use TSN settlement to separate sender funding from recipient payout.

## Integration Rules

### Use The SDKs

Apps should call SDK methods.

They should not manually derive TSN PDAs, build TSN instructions, or reimplement settlement logic.

### Resolve TINs First

Before payment, resolve the recipient TIN.

Show:

- TIN
- verified name if available
- verification status
- supported token route
- warning if no verified name exists

### Keep Status In Sync

Use backend payment status for normal user screens.

Do not make every frontend page poll Solana RPC directly.

## Example App Flow

```text
User enters TIN
App resolves TIN through SDK/backend
App displays identity confidence
User approves payment
App submits TSN payment work
Backend tracks status
Cranker executes settlement
User sees escrowed, claiming, or paid status
```

## Security Considerations

- Never log private route payloads.
- Do not display raw phone numbers unless the user authorized it.
- Do not claim stronger privacy than the protocol provides.
- Make failed or unverified identities obvious to users.

## Technical Details

| Need | Use |
| --- | --- |
| TIN identity | `tins-sdk` |
| TSN settlement | `tsn-sdk` |
| Cranker operation | `tsn-cranker-sdk` |
| App payment status | TrustLink backend |
