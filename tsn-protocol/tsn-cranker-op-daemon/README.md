# TSN Cranker Operator Daemon

The Cranker daemon is the reference settlement operator for TSN.

## What Is This?

It is a Receiver-driven execution operator. The Receiver is the durable work
source; the Cranker leases TSN Node-verified work and submits the exact
authorized on-chain transaction.

## Why It Exists

TSN separates sender-authorized epoch funding from DNA-bound recipient payout.
Crankers submit both stages while paying their own Solana fees.

## Responsibilities

- Lease Node-verified `AUTHORIZED_FUNDING` work and internally-created
  `SETTLEMENT` work from the TSN Receiver.
- For `AUTHORIZED_FUNDING`, submit only the sender-signed, Node-verified
  epoch-treasury transaction and pay its Solana fee. It creates no
  payment-specific escrow account.
- For `SETTLEMENT`, re-check Node/Mother DNA authorization, signatures, opaque
  slot commitment, epoch, amount, vault, recipient, and expiry before
  submitting the DNA-bound payout. Refunds remain Node/Mother-only operations.
- Back off while idle and wake from the Receiver's payload-free notification.

## Processing and evidence

```text
User device signs funding authorization off-chain
    -> Receiver/Node verify `AUTHORIZED_FUNDING`
    -> Cranker leases and submits the exact sender-signed epoch-treasury funding transaction
    -> Receiver: CONFIRMED; it creates internal `SETTLEMENT` work
    -> Receiver attaches Node/Mother DNA authorization to the leased settlement
    -> Cranker verifies exact binding and expiry, pays from its CrankerVault, and consumes the opaque epoch slot
    -> Cranker reports the settlement signature and slot metadata
    -> Receiver: CONFIRMED
```

The daemon logs pool state, settlement submission, and the final Receiver state.
It never logs private keys, master seeds, decrypted commitments, or raw
authorization payloads.

## Local Operation

```bash
npm --prefix tsn-cranker-op-daemon install
npm run tsn:cranker:register
npm run tsn:cranker:start
```

For the complete setup sequence, Mother Escrow PDA derivation, vault
initialization, environment configuration, and troubleshooting, see
[the Cranker operator guide](../../docs/CRANKER-OPERATOR-GUIDE.md).

## Security Rules

- Keep operator keys private.
- Do not log decrypted settlement payloads.
- Do not expose private routes in terminal output.
- Treat repeated simulation failures as quarantine candidates.
- Use `TSN_RPC_GATEWAY_URL` for Cranker Solana traffic; do not point the daemon
  at an unapproved upstream in production.

## Related Docs

- [Cranker operator guide](../../docs/CRANKER-OPERATOR-GUIDE.md)
- [TSN operations and testing](../../docs/operations-and-testing.md)
- [TSN security model](../../docs/security-model.md)
