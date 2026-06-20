# Crankers

Crankers are settlement operators in TSN.

They keep the network moving.

## What Is This?

A Cranker is software run by an operator.

It watches the TSN mempool, validates work, executes settlement tasks, and competes for recovery or reimbursement jobs.

## Why Crankers Exist

TrustLink Pay separates sender funding from recipient payout.

That separation improves privacy, but it needs operators to move work through the system. Crankers perform that job.

## What Crankers Do

Crankers can:

- validate payment intents
- reject tampered or expired work
- sponsor certain settlement transactions
- execute payouts from liquidity vaults
- earn claim or reputation credit
- participate in epoch settlement races
- monitor PrivacyReceivePDA sweep signals
- help recover epoch reservoirs

## Work Types

### Intent Work

Intent work checks whether a pending payment is valid.

A Cranker must verify signatures, amount, token, recipient route, nonce, expiry, and epoch data before moving it forward.

### Settlement Work

Settlement work moves a valid payment into the escrow and payout process.

The Cranker should only execute work that matches the sender authorization and TSN rules.

### Recovery Work

Recovery work handles vault or epoch states that need reimbursement.

Crankers compete for these jobs through minimal public challenges. The winner must submit valid proof.

## Reputation And Slashing

Cranker reputation is the protocol's way to reward useful work and discourage bad work.

Good work can increase a Cranker's standing or unlock more work. Bad work can reduce reputation and may be slashable when governance activates those rules.

## Example Flow

```text
Cranker starts
Cranker reads mempool
Cranker sees pending intent
Cranker validates it
Cranker submits valid settlement work
Recipient payout becomes available
Cranker executes payout
Commitment enters epoch accounting
Cranker watches for recovery challenges
```

## Security Considerations

- Crankers must never log private decrypted payloads.
- Crankers must reject stale or duplicate work.
- Crankers should not expose full payment routes in dashboards.
- Operator keys must be protected.
- Failed recovery work should be quarantined instead of retried forever.

## Important Limits

Crankers are not banks and should not custody user funds outside the protocol rules.

They are operators in a settlement network. Their job is to execute verifiable work.

## Technical Details

| Component | Path |
| --- | --- |
| Reference daemon | `tsn-cranker-op-daemon/` |
| Cranker SDK | `tsn-cranker-sdk/` |
| TSN SDK | `tsn-sdk/` |
| Mempool backend | `tsn-mempool-backend/` |
