# TrustLink Pay TSN Epoch Settlement v1 Experimental

**Version / commit reference:** v1 experimental, prepared for this branch before final commit.

## Summary

We are upgrading TSN around per-epoch isolation. Each epoch receives its own Protocol Escrow Reservoir (PEA) and commitment registry so value movement and payment metadata stay separated. The PEA holds funds; PaymentCommitment PDAs hold only hashes, amount commitments, nullifier hashes, TIN route hashes, lease references, and expiry metadata. Crankers race at epoch close to prove the aggregate math first. The first valid recovery submitter wins the recovery bonus, which gives operators a direct reason to run faster hardware, lower-latency RPC paths, and tighter daemon code.

## Implementation notes

### TSN Anchor program

New v1 accounts:

- `EpochAccount`: records epoch id, active PEA address, mint, aggregate root hash, challenge totals, recovery winner, and residual status.
- `PaymentCommitment`: commitment-only PaymentPDA equivalent; it never owns token balance.
- `PrivacyReceivePda`: temporary receive primitive linked to a TIN route hash and owner commitment.

New v1 instructions:

- `tsn_initialize_epoch`: initializes the epoch metadata and records the deterministic PEA address.
- `tsn_open_payment_commitment`: opens a commitment-only PaymentPDA and folds the commitment into the epoch aggregate root.
- `tsn_create_privacy_receive`: creates a TIN-linked PrivacyReceivePDA without exposing raw wallet or phone data.
- `tsn_process_batch_reimbursement`: verifies the recomputed root and aggregate checksum, records the first valid Cranker winner, and emits the 85/8/5/2 split math for settlement execution.
- `tsn_residual_sweep`: marks unclaimed epoch residuals sweepable after the 14-day timeout.

The v1 implementation keeps SPL token transfer execution isolated behind the deterministic PEA runtime path. This makes the account model auditable before we wire live confidential transfer primitives. We do not implement real confidential transfers in this change.

### TypeScript components

The TSN SDK and mempool backend should derive the same epoch and payment commitment addresses, then submit commitment-open and reimbursement transactions through owner-named calls such as:

```ts
await tsn.createPaymentIntent({
  tin: "1234567890",
  amount,
  commitmentHash,
});

await tsn.processBatchReimbursement({
  epochId,
  recomputedRootHash,
  totalToDistribute,
  crankerCreditSumMod,
});
```

The mempool runtime privately aggregates hashes only. It publishes the minimal challenge at epoch close: root hash, total to distribute, and checksum. Individual payment graphs stay inside encrypted mempool state guarded by Cranker DNA authorization and OTDT payload access.

### Python Cranker daemon

The Python Cranker daemon should:

1. Index encrypted TSN mempool commitments locally.
2. Recompute the epoch root and fee math immediately when the epoch challenge appears.
3. Submit `tsn_process_batch_reimbursement` with the fastest valid proof.
4. Treat invalid challenge mismatches as fraud signals for Cranker DNA slashing policy.
5. Continue supporting claim leases, OTDT-gated payload handling, and private payout fronting from TSN vault liquidity.

## Usage examples

### Cranker CLI

```bash
tsn-cranker epoch watch --epoch current --private-mempool http://127.0.0.1:8787
tsn-cranker epoch race --epoch 42 --rpc https://rpc.example.invalid
tsn-cranker residual sweep --epoch 42 --after-days 14
```

### SDK flow

```ts
const epoch = await tsn.initializeEpoch({ epochId, mint });
const intent = await tsn.createPaymentIntent({ tin, amount, commitmentHash });
await tsn.openPaymentCommitment({
  epoch,
  commitmentHash,
  nullifierHash,
  tinRouteHash,
  crankerLease,
  expiryTs,
});
```

## Security & privacy considerations

- Hidden: raw wallet addresses, phone numbers, full transaction graph, and individual mempool payloads.
- Exposed: commitment hashes, aggregate epoch root, aggregate totals/checksum, and recovery winner.
- Funds and data are separated: PEAs hold value; PaymentCommitment PDAs hold cryptographic metadata only.
- Cranker participation remains gated by Cranker DNA derived from the TSN mother escrow, operator, and protocol seed.
- The 2% fastest recovery bonus is paid only after the aggregate root and math match the epoch challenge.
- Residual sweeping is delayed for 14 days to preserve manual claim windows.


- The broader security rationale is documented in [TrustLink Pay Security Philosophy: Secure Web3 Payments Without Becoming a Bank of Regret](./SECURITY-PHILOSOPHY.md).


## Testing notes

Run the Anchor compile check from the protocol workspace:

```bash
cd tsn/protocol
cargo test --no-default-features
```

For mempool simulation, run the local stack and point a Cranker daemon at the private challenge endpoint:

```bash
node scripts/start-tsn-mempool-stack.mjs
npm --prefix tsn-cranker-op-daemon run cranker -- epoch watch
```

## Cranker daemon v1 integration

The TypeScript Cranker operator daemon now has a first-pass epoch race loop. On every poll it asks the Mempool runtime for open epoch challenges, validates that the root hash is a 32-byte commitment root, and submits `tsn_process_batch_reimbursement` with the local Cranker operator keypair. The daemon then records the submitted transaction signature and winning Cranker identity back into the mempool challenge record.

The Cranker SDK setup CLI also exposes a manual race path for operators who want to test or recover an epoch without waiting for the long-running daemon loop:

```bash
npm --prefix tsn-cranker-sdk run cranker -- race-epoch \
  42 \
  <ROOT_HASH_HEX_32_BYTES> \
  <TOTAL_TO_DISTRIBUTE_BASE_UNITS> \
  <CRANKER_CREDIT_SUM_MOD>
```

The Mempool runtime challenge object is intentionally small: epoch id, root hash, aggregate total, checksum, optional PEA/EpochAccount references, status, winner, and reimbursement signature. It does not publish raw TINS routes, OTDT payloads, wallet addresses, phone numbers, or payment graphs.

## Mempool runtime epoch lifecycle ownership

**Version / commit reference:** v1 experimental submodule patch handoff.

The Mempool runtime owns the off-chain epoch lifecycle for v1. The TSN program verifies roots and reimbursement math, but the Mempool runtime is responsible for keeping Crankers synchronised before that proof reaches chain.

### Mempool responsibilities

- Proactively create the next `EpochRecord` 30-60 minutes before the active epoch ends so Crankers can pre-warm caches, PEA references, and RPC subscriptions.
- Privately collect `PaymentCommitment` inputs from sender-authorised TSN work without publishing raw TINS routes, wallet addresses, phone numbers, or OTDT payloads.
- Compute the epoch aggregate root with commitment hashes and amount math only.
- Release the minimal public epoch challenge: `epoch`, `rootHash`, `totalToDistribute`, `crankerCreditSumMod`, optional `EpochAccount`, optional PEA, and challenge status.
- Track PrivacyReceivePDA watches and mark deposits as `sweep_required` for authorised sweep workers.
- Expose epoch state to the mempool frontend so operators can see liveness and recovery status without seeing the private payment graph.

### Submodule patch handoff

Because `tsn-mempool-backend` and `tsn-mempool-frontend` are separate git submodules, this repository carries patch files rather than editing those repos directly:

- `docs/submodule-patches/tsn-mempool-backend-epoch-v1.patch`
- `docs/submodule-patches/tsn-mempool-frontend-epoch-v1.patch`

Apply each patch inside its submodule repository, adapt only file paths/import style if that submodule has diverged, then run that submodule's test/build pipeline.
