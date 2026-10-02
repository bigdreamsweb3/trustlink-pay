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

Before executing Node-verified funding or TIN work, the Cranker verifies the
Node's Ed25519 attestation with `TSN_NODE_VERIFICATION_PUBLIC_KEY` and checks
the signed commitment against the exact execution payload returned by the
Receiver. Configure this public key from the Node verification keypair; the
Cranker does not need the private signing key. Solana payout authorizations
continue to use their separate Node signature, which the TSN program verifies
on-chain.

Before leasing work, startup checks the single configured TSN RPC gateway with
`getVersion` and validates Mother Escrow through that same gateway. If either
check fails, the Cranker stops before claiming Receiver work; it does not switch
to a local validator or a public Solana endpoint. The gateway must have a
working upstream; its `getHealth` response alone does not prove that account
reads or transaction submission work.

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
- Use `TSN_RPC_URL` to choose the Cranker's RPC endpoint. It defaults to the TSN
  RPC gateway; local development may point it to `http://127.0.0.1:8787`.
  Startup validates only that endpoint and does not fall back to another RPC.
- At startup, the Cranker checks `TSN_LOCAL_RECEIVER_URL` (default
  `http://127.0.0.1:8010`) at `/api/health`. A ready local Receiver is pinned
  for the process lifetime so leases and results stay in the same work store.
  If no local Receiver is ready, it uses `TSN_RECEIVER_URL` (default
  `https://tsn-receiver-kappa.vercel.app`). Set both explicitly when operating
  a non-default environment.

## Related Docs

- [Cranker operator guide](../../docs/CRANKER-OPERATOR-GUIDE.md)
- [TSN operations and testing](../../docs/operations-and-testing.md)
- [TSN security model](../../docs/security-model.md)
