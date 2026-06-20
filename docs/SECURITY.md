# Security

This document explains the security model in plain English.

## What Is This?

TrustLink Pay combines identity, settlement, operators, liquidity, and epoch accounting.

Security depends on clear boundaries between those parts.

## Main Security Goals

1. Do not expose wallet addresses as the normal payment identity.
2. Do not publish private social identity data.
3. Do not expose the full payment graph when a normal user pays.
4. Make settlement work verifiable.
5. Prevent replay and duplicate settlement.
6. Hold Crankers accountable for bad work.
7. Keep epoch accounting isolated.

## Privacy Model

TrustLink Pay improves privacy through separation.

The sender-side funding step and recipient-side payout step are not the same public transfer. Commitments and epoch roots help prove work without publishing the full private route.

This is not the same as complete anonymity.

Solana remains public. Program activity remains visible. The goal is to avoid exposing the most obvious payment graph.

## Identity Security

TINs are public payment identities.

Social identities should be encrypted. Sensitive fields should require explicit user authorization before decryption.

The app must show which identity source it is displaying:

- TINS registry name
- TrustLink display name
- WhatsApp or social profile name
- verification platform result

## Cranker Security

Crankers must validate work before executing it.

They should check:

- signatures
- nonce
- expiry
- amount
- token
- recipient route
- epoch
- commitment hash
- duplicate work status

Bad or repeated failures should be quarantined, not retried endlessly.

## Epoch Security

Epochs isolate risk.

Each epoch has its own reservoir and aggregate root. Public challenge data should include only what Crankers need to compete and verify work.

## Operational Security

Operators should protect:

- Cranker keys
- verifier keys
- permit signing keys
- mempool API keys
- RPC credentials
- deployment authority keys

Never paste private keys into public chats, logs, screenshots, or dashboards.

## Important Limits

No documentation should promise impossible privacy.

The correct claim is:

```text
TrustLink Pay reduces direct payment graph exposure through separated settlement and commitments.
```

The incorrect claim is:

```text
TrustLink Pay makes payments invisible.
```

## Related Docs

- [Architecture](./ARCHITECTURE.md)
- [TSN Commitment Settlement](./TSN-COMMITMENT-SETTLEMENT.md)
- [Cranker](./CRANKER.md)
- [Liquidity](./LIQUIDITY.md)
