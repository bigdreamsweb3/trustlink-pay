# Architecture

TrustLink Pay has one product surface and several protocol layers.

The product surface is simple: users send stablecoins to a TIN.

The protocol layers make that possible without turning every payment into a simple public wallet-to-wallet graph.

## What Is This?

TrustLink Pay is made of:

1. **Transfer Identity System**: payment identity
2. **TSN**: settlement
3. **Crankers**: execution
4. **Vaults**: payout liquidity
5. **Epoch accounting**: reimbursement and recovery
6. **TrustLink app and backend**: user experience and records

## Why This Structure Exists

A direct transfer is simple, but it exposes a clear graph:

```text
sender wallet -> recipient wallet
```

TrustLink Pay avoids making that the normal payment path. It separates identity, funding, payout, and accounting into different parts.

## How The Layers Work

### Transfer Identity System: Identity Layer

The Transfer Identity System creates and resolves payment identities.

A Transfer Identity is the public payment identity. It can include a 10-digit TIN that is shared like an account number. The wallet address is not the normal payment identity.

The Transfer Identity registry can store:

- the TIN number
- public display or legal-name status
- encrypted social identities
- verification platform references
- routing metadata needed by integrations

### TSN: Settlement Layer

TSN handles payment settlement.

It accepts sender-authorized payment work, moves funds through an escrow path, and coordinates recipient payout through vault liquidity.

TSN uses commitments and epoch records so the public chain can verify settlement without needing the full private payment graph.

### Crankers: Operator Layer

Crankers are operators that do work for the network.

They:

- watch the mempool
- validate payment work
- reject tampered or expired work
- sponsor settlement transactions when required
- execute vault payouts
- race to recover or reimburse epoch reservoirs
- build reputation through correct work

### Vaults: Liquidity Layer

Vaults provide liquidity for payouts.

A Cranker can pay the recipient from vault liquidity, then the protocol later reconciles the vault using commitments and epoch accounting.

### Epoch Accounting

An epoch is a settlement window.

Each epoch has an isolated reservoir called a PEA. The PEA keeps that epoch's accounting separate from other epochs. This reduces risk and gives the system a clean place to perform reimbursement and recovery.

## Example Flow

```text
Recipient has a TIN
Sender enters that TIN
TrustLink resolves public identity details
Sender approves payment
Payment enters the TSN mempool
Cranker validates the work
Sender-side escrow is created
Recipient is paid from vault liquidity
Payment commitment is recorded
Epoch root is calculated
Crankers compete to settle or recover the epoch
```

## Security Considerations

- Payment identity is a TIN, not a raw wallet address.
- Public records use commitments and roots where possible.
- Crankers must validate structure, signatures, routing, and timing before acting.
- Epoch reservoirs limit the blast radius of accounting problems.
- Cranker reputation and slashing are part of the operator safety model.
- Governance and operator tooling should warn before epoch handoff or recovery fails.

## Important Limits

TrustLink Pay does not make Solana private.

It makes the normal payment graph less direct. A determined observer with enough context may still inspect public program activity.

The system must never claim impossible privacy guarantees.

## Technical Details

| Component | Path |
| --- | --- |
| Transfer Identity program | `tin-system/tins-registrar/program/` |
| TSN program | `tsn/protocol/` |
| TSN SDK | `tsn-sdk/` |
| Cranker daemon | `tsn-cranker-op-daemon/` |
| Cranker SDK | `tsn-cranker-sdk/` |
| Mempool backend | `tsn-mempool-backend/` |
| Mempool explorer | `tsn-mempool-frontend/` |
| TrustLink app | `frontend/` |
| TrustLink API | `backend/` |

## Related Docs

- [Transfer Identity](./TRANSFER-IDENTITY.md)
- [TSN commitment settlement](./TSN-COMMITMENT-SETTLEMENT.md)
- [Cranker guide](./CRANKER.md)
- [Liquidity](./LIQUIDITY.md)
- [Security](./SECURITY.md)
