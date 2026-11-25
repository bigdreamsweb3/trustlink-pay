# TSN Cranker Operator Daemon

The Cranker daemon is the reference Receiver-driven execution operator for TSN. The Receiver is the durable work
source; the Cranker leases TSN Node-verified work and submits the exact
authorized on-chain transaction.

## Independent funding submission

The daemon runs one `AUTHORIZED_FUNDING` loop independently from its serialized settlement, TIN, debit and accounting loop. Each loop completes one work item before its next claim. Slow native authorization or confirmation therefore does not hold the funding loop. Both loops share the existing thirty-per-minute operator lease admission budget; they use distinct Receiver sessions so one loop cannot overtake the other's authenticated request counter. Claim duration and age of the Node decision are logged alongside the existing work identity. The exact owner wire, twenty-block guard, Node attestation, confirmation and failed-attempt reconciliation remain required.

Load matching Receiver, Node and Cranker source through their existing commands. No program, dependency, environment or storage migration change is required. RPC/storage delay, wallet review and CPU saturation can still cause expiry. The [November 25 validation](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/references/FUNDING-ISOLATION-20261125.md) distinguishes offline scheduling/authorization checks from live payment evidence.

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
User device signs the canonical intent approval
    -> Receiver stores AUTHORIZATION work; Node checks authorization, recipient, asset and advisory funds
    -> Node returns FUNDING_READY; application shows Ready to approve funding
    -> User approves a deposit with a fresh blockhash in the wallet
    -> Receiver attaches that exact signed deposit to the same intent and creates its internal settlement reference
    -> Node performs final signed-deposit verification and returns VERIFIED
    -> Cranker leases funding, checks the 20-block margin and submits the exact sender-signed TCAP deposit
    -> Funding confirms; Node verifies the linked settlement and proves funded membership
    -> Receiver exposes Node-verified settlement authorization to the leased Cranker
    -> Cranker builds the exact settlement message and requests the Mother Node signature through Receiver
    -> Mother validates lease/message, selects the final blockhash and signs that message
    -> Cranker verifies unchanged nonhash bytes, metadata and Mother signature, then payer-signs
    -> Cranker checks 20-block margin, checkpoints the final identity, submits once and confirms
    -> Receiver: CONFIRMED
```

The daemon logs work state, settlement submission, and the final Receiver state.
It never logs private keys, master seeds, decrypted commitments, or raw
authorization payloads.

Before executing Node-verified funding or TIN work, the Cranker verifies the
Node's Ed25519 attestation with `TSN_NODE_VERIFICATION_PUBLIC_KEY` and checks
the signed commitment against the exact execution payload returned by the
Receiver. Configure this public key from the Node verification keypair; the
Cranker does not need the private signing key. Mother co-signing is separate from that decision receipt; TCAP and GPRU enforce the funded membership, asset/amount binding, secret-derived nullifier and confidential-state proof on chain.

A single genuine confirmed deposit supports credit without creating a pool account or waiting for another depositor. The canonical global funding account authenticates current and up to 128 retained root/count records. New deposits within that window preserve funded membership; a retired root requires fresh unsigned verification. The latest shared head/nullifier state remains mandatory for one-time spending. Before signing, Cranker checks canonical global funding-account ownership/PDA, exact version-2 layout and selected-root retention. Retired-root/shared-root/epoch/route/authorization conflicts require authenticated fresh verification; a saved signature requires reconciliation. Receiver independently checks lease and confirmed funding lineage.

Before leasing work, startup checks the single configured TSN RPC gateway with
`getVersion` and validates Mother Escrow through that same gateway. If either
check fails, the Cranker stops before claiming Receiver work; it does not switch
to another endpoint during startup. If an `AUTHORIZED_FUNDING` submission gets
`BlockhashNotFound`, the Cranker retries the exact same sender-signed bytes
through `TSN_RPC_FALLBACK_URL` (default
`https://api.devnet.solana.com`). It does not refresh the blockhash or modify
the transaction, and this retry does not apply to other work kinds. Before each
endpoint sends, a confirmed `getBlockHeight` request uses the original
`minContextSlot`; fewer than 20 blocks before the reported deadline or an invalid
or unavailable height prevents that send. The gateway
must have a working upstream; its `getHealth` response alone does not prove
that account reads or transaction submission work.

## Confirmation reporting and expired leases

A chain-confirmed transaction can outlive its bounded Cranker lease. Receiver accepts a late native CONFIRMED report only after finalized receipt verification against the durable signed checkpoint, original reporting payer and expired authorization/lease generation. It checks both signatures, wire identity, exact authorized instruction/Memo, canonical accounts and resulting TCAP root; another lease or changed receipt fails. Signing still requires an active lease.

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

Funding execution requires the Node-signed `senderFundingBlockhashContext` tuple alongside its wire and mode. Cranker validates the exact keys, canonical nonzero hash and integer lifetime/slot, verifies all wallet signatures and checks that serialization preserves the wire. Confirmed height checks and preflight use the tuple's `contextSlot` as `minContextSlot` for both the selected endpoint and the existing funding fallback. Gateway bank failover preserves the exact request; it cannot extend the owner-signed deposit's blockhash lifetime. This tuple is a client-reported hint rather than independent expiry/nonexecution evidence; inspect original signatures and confirmed funding before replacement.

The single FAILED report retains the original owner signature and `fundingSubmission` evidence: short hash fingerprint, context slot, reported last valid height, 20-block minimum and each endpoint's observed height, remaining blocks, phase and whether the send method was invoked. Numeric RPC/instruction/custom codes are retained when available; provider messages, transaction wires and logs are excluded. `sendInvoked=false` describes only that recorded attempt, and neither a margin rejection nor a failed send proves nonexecution. Confirmation failure retains the same identity; a chain-confirmed transaction with a pending Receiver receipt remains a pending confirmation report. Offline funding tests cover the margin boundary, malformed heights, same-wire fallback and ambiguous submission evidence; live submission remains unverified.

## Experimental private-credit and aggregate accounting

A single genuine confirmed deposit supports credit without creating a pool account or waiting for another depositor. The canonical global funding account authenticates current and up to 128 retained root/count records. New deposits within that window preserve funded membership; a retired root requires fresh unsigned verification. The latest shared head/nullifier state remains mandatory for one-time spending.

Individual credit keeps the actual amount in a fresh blinded commitment, updates current shared head/nullifier state and appends the blinded epoch transcript without reserve-liability reclassification. Node prepares complete ordered openings for separate `TCAP_EPOCH_ACCOUNTING`; Receiver coordinates versioned leases and Cranker submits the exact Mother-authorized accounting message. Complete accounting requires 2–64 accepted credits; a singleton carries forward. This accounting rule does not delay individual credit readiness.

Native hidden-head credit and epoch accounting receive a bounded 180-second Cranker lease covering Node authorization, Mother co-signing and submission. Node claims and funding/TIN/other-settlement Cranker claims remain 60 seconds. Signing requires the current active lease; expired unsigned work requires fresh verification, while a saved signature retains its reconciliation boundary.

For native credit and epoch accounting, Node validates the exact unsigned V1 message, verified transition and current lease before selecting the final confirmed blockhash. It changes only message bytes [8:40], revalidates the full message/hash in a positive nondecreasing bank context and synchronously rechecks lease limits before Mother signs. No awaited RPC follows the final validity check. Cranker verifies the Mother signature, authority, exact non-hash bytes and canonical positive lifetime/context metadata before payer signing. The final issuing context becomes `minContextSlot` for the 20-block margin check, preflight and height polling; Receiver durably checkpoints that final identity before broadcast. No recorded attempt or owner-signed deposit can be refreshed through this path.

Receiver preserves the exact domain 404 `Receiver work was not found`. Missing signing endpoints, transport/interrupted-body failure and HTTP 5xx can use configured fallback; exhaustion returns a sanitized signing-service 503. Exact signing/lifetime/height availability failures may requeue unsigned native work only under active owner/lease/version and no-checkpoint guards. Malformed metadata and signed attempts are excluded. Pool-specific recovery is retired.

Node must retain protected amount openings and matching credit/epoch artifacts. Existing version-1 global funding accounts require their explicit governance-authorized in-place migration after compatible program deployment. The circuit is unchanged solely for pool removal. Public deposit/aggregate amounts, singleton source linkage, timing, recipient/head history and Node knowledge remain privacy limits. [ABI](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/credit-abi.md) and [November 8 checks](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/experiments/EXP-20261108-remove-funding-pools.md) separate source/offline evidence from unperformed activation/live settlement.

## External settlement scope

**Status: CURRENT source retirement, November 22, 2026.** The former external payout adapter, authorization handler and key-funding command are removed. Cranker has no enabled EVM submission route; planned Base, Arbitrum and Polygon integrations require separately implemented and verified adapters. Native Solana funding, TIN creation, private credit and aggregate accounting retain their existing authorization, lease and confirmation contracts. Private keys, environment files, existing deployment state and user-managed services were not changed by this source update.
