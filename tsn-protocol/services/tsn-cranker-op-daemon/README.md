# TSN Cranker Operator Daemon

The Cranker daemon is the reference Receiver-driven execution operator for TSN. The Receiver is the durable work
source; the Cranker leases TSN Node-verified work and submits the exact
authorized on-chain transaction.

## Funding and settlement

Native wallet-to-TIN credit separates the sender-approved TCAP reserve deposit from the proof-authorized confidential-state transition. Cranker broadcasts the deposit without changing its signed bytes or payer; the SDK sets the depositor as its fee payer. Cranker pays the later native settlement transaction fee and obtains the exact Mother-authority co-signature through Receiver.

## Responsibilities

- Lease Node-verified `AUTHORIZED_FUNDING` work and internally-created
  `SETTLEMENT` work from the TSN Receiver.
- For `AUTHORIZED_FUNDING`, submit only the sender-signed, Node-verified
  `deposit_private_funding_v1` transaction in `tcap_funded_note_v1` mode. The
  deposit transfers exact reserve assets and appends a funded leaf to TCAP's global tree.
- For native `SETTLEMENT`, verify the Node receipt, current Receiver lease, Mother authority,
  public transition, current roots, proof-bound Memo and expiry, then submit the co-signed TSNP credit.
  Cranker receives no private note opening or funding membership path and holds no Mother key.
- For `TIN_OPERATION`, submit the supported direct or staged owner-approved creation transaction.
- Back off while idle and wake from the Receiver's payload-free notification.

## Processing and evidence

```text
User device signs intent approval and the funded-note reserve deposit
    -> Receiver/Node verify `AUTHORIZED_FUNDING`
    -> Receiver pre-creates internal RECEIVED settlement work at ingress
    -> Cranker leases and submits the exact sender-signed TCAP deposit
    -> Funding confirms; Node verifies the linked settlement and proves funded membership
    -> Receiver exposes Node-verified settlement authorization to the leased Cranker
    -> Cranker builds the exact settlement message and requests the Mother Node signature through Receiver
    -> Mother Node validates the active lease and message, then signs it
    -> Cranker pays from its own key and submits the co-signed transaction
    -> Cranker checkpoints the signed identity, submits once and reports confirmation
    -> Receiver: CONFIRMED
```

The daemon logs pool state, settlement submission, and the final Receiver state.
It never logs private keys, master seeds, decrypted commitments, or raw
authorization payloads.

Before executing Node-verified funding or TIN work, the Cranker verifies the
Node's Ed25519 attestation with `TSN_NODE_VERIFICATION_PUBLIC_KEY` and checks
the signed commitment against the exact execution payload returned by the
Receiver. Configure this public key from the Node verification keypair; the
Cranker does not need the private signing key. Mother co-signing is separate from that decision receipt; TCAP and GPRU enforce the funded membership, asset/amount binding, secret-derived nullifier and confidential-state proof on chain.

The public transition carries `fundingRootAccount` and thirteen proof inputs, with the funded root at index 12; the TSNP outer call appends its readonly root account as account 14. Before signing, Cranker checks the canonical account layout and current root against the proof. If a later deposit advances that valid root, preflight or Node co-signing returns `TCAP_FUNDING_ROOT_CHANGED_BEFORE_SETTLEMENT`; the daemon requests signed Receiver `POST /api/cranker/work/retry` with the current work/version and exact reason. Receiver verifies its active lease ownership, expiry, confirmed funding lineage and absence of saved execution state, then wakes Node to rebuild the proof using the unchanged private note and nullifier. Malformed/missing funded accounts fail separately; a saved transaction signature requires reconciliation. The funded root and updated verifier/proving artifacts require separate setup; local validation does not establish that deployed programs accept this contract. The retained Creditcoin settlement branch remains distinct, and epoch payout/refund and verifier initialization are outside the daemon's normal dispatcher.

Before leasing work, startup checks the single configured TSN RPC gateway with
`getVersion` and validates Mother Escrow through that same gateway. If either
check fails, the Cranker stops before claiming Receiver work; it does not switch
to another endpoint during startup. If an `AUTHORIZED_FUNDING` submission gets
`BlockhashNotFound`, the Cranker retries the exact same sender-signed bytes
through `TSN_RPC_FALLBACK_URL` (default
`https://api.devnet.solana.com`). It does not refresh the blockhash or modify
the transaction, and this retry does not apply to other work kinds. The gateway
must have a working upstream; its `getHealth` response alone does not prove
that account reads or transaction submission work.

## Confirmation reporting and expired leases

A chain-confirmed transaction can outlive its 60-second Cranker lease. Receiver accepts a late native CONFIRMED report only after finalized receipt verification against the durable signed checkpoint, original reporting payer and expired authorization/lease generation. It checks both signatures, wire identity, exact authorized instruction/Memo, canonical accounts and resulting TCAP root; another lease or changed receipt fails. Signing still requires an active lease.

Cranker retries temporary RPC/finality and report transport failures with the identical confirmation body up to six times, using a 25-second deadline covering authentication/report requests and five seconds between attempts. Receipt or authorization mismatches are not retried. A remaining write failure logs a pending receipt with the existing signature and does not produce a FAILED transaction report. Reload Receiver and Cranker after this correction. Already FAILED receipts use the receipt-only operator utility; see [the finalized reference credit and recovery command](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/references/TSN-OPERATOR-GUIDE-20261105.md#expired-cranker-confirmation-report).

## Local Operation

```bash
npm run register
npm run crank:start
```

For the complete setup sequence, Mother Escrow PDA derivation, vault
initialization, environment configuration, and troubleshooting, see
[the Cranker operator guide](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/CRANKER-OPERATOR-GUIDE.md). Run the commands above from this package only when operating the intended registered environment.

## Security Rules

- Keep operator keys private.
- Do not log decrypted settlement payloads.
- Do not expose private routes in terminal output.
- Treat repeated simulation failures as quarantine candidates.
- Use `TSN_RPC_URL` to choose the Cranker's RPC endpoint. It defaults to the TSN
  RPC gateway; local development may point it to `http://127.0.0.1:8787`.
  Startup validates that endpoint. Funding submission retries another Devnet
  RPC only after `BlockhashNotFound`; set `TSN_RPC_FALLBACK_URL` to override it.
- At startup, the Cranker checks `TSN_LOCAL_RECEIVER_URL` (default
  `http://127.0.0.1:8010`) at `/api/health` up to three times, with a five
  second timeout per check. A ready local Receiver is pinned for the process
  lifetime so leases and results stay in the same work store. Hosted selection
  via `TSN_RECEIVER_URL` requires `TSN_ALLOW_HOSTED_RECEIVER_FALLBACK=true`;
  otherwise startup stops when the local Receiver is not ready.

## Related Docs

- [Cranker operator guide](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/CRANKER-OPERATOR-GUIDE.md)
- [Native transaction contract](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/credit-abi.md)
- [TSN operations and verification](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/operations-and-verification.md)

Gateway bank failover preserves the exact request; it cannot extend the owner-signed deposit's blockhash lifetime.

## Experimental private-credit and aggregate accounting

The current replacement hides individual credit amount in a freshly blinded commitment, keeps reserve liabilities unchanged on credit, and uses dedicated `TCAP_FUNDING_POOL` and `TCAP_EPOCH_ACCOUNTING` work. Node validates positive unspent captured members and source-wallet counts, prepares current-root proofs and complete ordered epoch openings; Receiver paginates/defer leases and serializes native verification; Cranker submits exact lease-bound Mother-authorized transactions. Pool capture needs two notes/two wallets, and complete accounting requires 2–64 credits. Common windows adapt to traffic; zero-value actors never qualify a pool. Signed uncertain attempts remain locked for exact finalized receipt reconciliation.

Node must retain its protected amount-opening journal and configure both credit and six `GPRU_EPOCH_*` artifact settings. Explicit credit rekey and separate epoch-verifier enrollment require matching keys. [ABI](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/credit-abi.md) and [offline evidence](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/experiments/EXP-20261107-private-credit-epoch.md) distinguish implemented checks from unverified SBF/activation/live payment. Deposit amounts, aggregate totals, metadata, Node knowledge and recipient/head correlations remain privacy limits; provider admission/rewards are outside this change.
