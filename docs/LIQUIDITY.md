# Liquidity

Liquidity is what lets recipients get paid quickly.

## What Is This?

TrustLink Pay uses vault liquidity for recipient payouts.

A vault is a pool of funds that can be used to pay recipients while the protocol reconciles the sender-side escrow through commitments and epoch settlement.

## Why It Exists

If every payment had to wait for every internal settlement step, the user experience would feel slow.

Vault liquidity lets the recipient receive funds faster. The system then uses epoch accounting to reimburse or recover the vault.

## How It Works

1. Sender authorizes payment.
2. Funds enter the TSN escrow path.
3. A valid Cranker pays the recipient from vault liquidity.
4. The payment creates a commitment.
5. The commitment is included in an epoch.
6. Epoch settlement reimburses or recovers the reservoir.

## Epoch Reservoirs

Each epoch has a PEA reservoir.

The PEA keeps that epoch's settlement accounting separate. This makes it easier to know which funds belong to which settlement window.

## Recovery Distribution

When recovery runs, the protocol split is:

| Recipient | Share |
| --- | ---: |
| Liquidity providers | 85% |
| Treasury | 8% |
| Operator reward | 5% |
| Reserve | 2% |

This split is intended to keep liquidity providers whole, fund protocol operations, reward useful work, and maintain a small reserve.

## Smart Recovery

Recovery should not run blindly after every payment.

The system should monitor:

- vault liquidity
- pending intents
- settlement velocity
- epoch age
- depleted Cranker or vault states

Recovery should prioritize states that create real liquidity risk.

## Security Considerations

- Recovery work must be tied to valid commitments.
- Recovery should not reveal private payment routes.
- The same work must not be recoverable twice.
- Low-liquidity states should receive priority.
- Failed permanent recovery errors should be quarantined.

## Important Limits

Vault liquidity improves speed. It does not remove settlement risk.

The protocol still needs monitoring, governance, operator discipline, and careful accounting.
