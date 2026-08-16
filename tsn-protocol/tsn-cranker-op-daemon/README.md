# TSN Cranker Operator Daemon

The Cranker daemon is the reference settlement operator for TSN.

## What Is This?

It is a Receiver-driven settlement operator. The Receiver is the durable work
source; the Cranker leases only TSN Node-verified work and then submits the
authorized on-chain transaction.

## Why It Exists

TSN separates sender funding from recipient payout. Crankers keep that separated settlement flow moving.

## Responsibilities

- Lease verified payment intents, claims, and recovery work from the TSN Receiver.
- Re-check Node route attestations, immutable payout authorizations, signatures,
  commitments, epochs, amounts, and expiry before signing or submitting.
- Submit the sender-authorized funding transaction, then report its signature
  and bounded proof metadata to the Receiver.
- Lease the resulting claim only after the Receiver records the payment as
  `CONFIRMED`; execute the Cranker-vault payout and report that transaction.
- Execute authorized recovery work when the Node publishes a recovery proof.
- Back off while idle and wake from the Receiver's payload-free notification.

## Processing and evidence

```text
Receiver: VERIFIED work
    -> Cranker leases it
    -> Cranker verifies Node proof and exact binding
    -> Cranker submits the authorized Solana transaction
    -> Cranker reports signature + commitment/nullifier metadata
    -> Receiver: CONFIRMED
    -> next CLAIM becomes leaseable
    -> Cranker pays from its settlement vault
    -> Cranker reports payout signature + proof metadata
```

The daemon logs `pool.state` at startup and around leased work (Mother Escrow
epoch/lease policy, escrow/verifier/Cranker lamports and fee splits),
`*.proof_verified` for the bounded proof metadata, `*.submitted` for the
transaction signature, and `receiver.work_reported` for the final Receiver
state. It never logs private keys, master seeds, decrypted PRU routes, or raw
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
