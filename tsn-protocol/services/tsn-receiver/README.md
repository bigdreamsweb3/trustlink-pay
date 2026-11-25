# TSN Receiver by TrustLink Labs

The TSN Receiver by TrustLink Labs is the durable D1 JSON-backed ingress,
status, and work-publication service for the Transfer Settlement Network
(TSN). It accepts payment and TIN-operation submissions, preserves narrow
coordination records and restricted encrypted Node payloads, leases work atomically, and publishes final status
and transaction evidence.

The Receiver is not the TSN Node and is not a Cranker. It does not verify
hidden-head proofs, decrypt owner identity records, sign transactions, or
hold protocol authority.

For the exact payment-data retention boundary, Node verification checks, and
Cranker proof flow, see the repository guide: [TSN Receiver verification and
Cranker settlement](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/architecture-map.md).

State flow:

`RECEIVED (AUTHORIZATION) -> NODE_VERIFYING -> FUNDING_READY -> RECEIVED (SIGNED_DEPOSIT) -> NODE_VERIFYING -> VERIFIED -> CRANKER_LEASED -> SUBMITTED -> CONFIRMED`

The TSN Node is the only service allowed to move work from `RECEIVED` to `VERIFIED`. Crankers can lease only `VERIFIED` work. All leases and transitions use atomic record-store transactions and monotonic state versions.

Node requests disjoint funding phases with `{nodeId, supportedKinds: ["AUTHORIZED_FUNDING"], fundingPhase: "AUTHORIZATION" | "SIGNED_DEPOSIT"}` at `POST /api/internal/node/work`. Receiver validates the phase/kind combination and rechecks it in reclamation and claim transactions. Node runs signed verification independently from ordinary preparation/proving/accounting; its normal supported-kind list excludes funding. Cranker likewise uses disjoint funding/native supported kinds without changing Receiver authorization, shared-root or lease guards. Matching Receiver, Node and Cranker source must be loaded together; the funding-lane change requires no program or stored-record conversion.

## Local Node durable relay

Node runs locally and initiates every Receiver connection. Receiver queues bounded encrypted requests in `tsn_node_requests` and maintains a payload-free activity revision in `tsn_node_relay/activity`. Authenticated `/api/internal/node/relay` supports GET sync, POST claim, PUT renewal and PATCH attested reply. Public Node APIs use `/node/<path>`; existing network/identity forwarding uses the same durable transport. Receiver `/intents` retains authenticated Node ingress.

Requests use separate FUNDING, SIGNING and PUBLIC lanes, 128 active jobs per lane, 60-second renewable claims and deadline-bounded execution. Public requests expire after 120 seconds and wait up to 20 seconds per HTTP call. Native requests retain their original Cranker work/version/lease deadline and wait up to 120 seconds. Pending public replies return 503 `NODE_RELAY_PENDING` with `x-tsn-relay-id`; clients resume only that exact ID. Replies use the existing pinned Node Ed25519 key and are encrypted at rest. Cleanup expires active jobs and deletes up to 32 terminal records after one-day retention; ISO string deadlines use application cleanup, not database TTL.

Cloudflare D1 JSON records provide hosted authoritative storage. Local JSON supports isolated tests and cannot persist workstation files from Vercel. Relay routes export `maxDuration=180`; deployed plan support and D1 behavior require hosted verification. [Relay contracts](lib/node-relay/README.md) record source/offline evidence and limits.

## Funded-note ingress and settlement projection

Native funding begins with `senderFundingMode: "tcap_funded_note_v1"`, the wallet-signed payment authorization and restricted `fundingNote: {version: 1, secret, blinding, commitment}` material. Initial `/intents` ingress forbids `senderSignedFundingTransaction` and `senderFundingBlockhashContext`. The three note values use canonical 32-byte BN254 scalar hex; secret and commitment must be nonzero. Receiver verifies the sender signature and shape, encrypts the original intent, and preserves its immutable `authorizationPayloadCommitment`. Node performs authorization, recipient, asset and source-balance checks before returning a signed `FUNDING_READY` decision; a balance observation reserves no funds.

The owner-authenticated Node readiness API prepares funding from the saved checks. The wallet obtains a fresh blockhash and signs the exact `deposit_private_funding_v1` transaction. Node forwards completion to `POST /api/internal/node/work/funding` using `{id, expectedVersion, authorizationPayloadCommitment, senderSignedFundingTransaction, senderFundingBlockhashContext}`. This Receiver route requires Node service credentials, current unexpired readiness and the original approval commitment. It merges only the signed wire and exact tuple into the encrypted intent, changes `fundingPhase` to `SIGNED_DEPOSIT`, and atomically creates settlement using the completed funding payload commitment. An exact attachment retry succeeds after later transitions; a changed wire or tuple fails. The public `/network/funding/readiness` and `/network/funding/complete` routes proxy owner requests to Node without browser service credentials.

Attached funding requires `senderFundingBlockhashContext: {blockhash, lastValidBlockHeight, contextSlot}` for that signed transaction. The hash must be a canonical nonzero 32-byte Base58 value; the height must be a positive safe JavaScript integer number, and the slot a nonnegative safe integer number. Strings, incomplete tuples and extra nested keys fail validation. Receiver encrypts the attached tuple, retains its Node-verified execution evidence, and includes it in the attested Cranker projection. It provides RPC bank/lifetime context; it is not an issuer signature or proof of transaction acceptance.

Public status projections omit this context. Confirmed receipt compaction removes it from execution evidence with the signed funding wire while retaining existing receipt and settlement lineage; the encrypted original ingress remains separate. Older unconfirmed funding without the required tuple fails closed; this repair neither rewrites those records nor refreshes signed bytes. A prior attempt still requires checking its receipt before preparing and signing replacement funding.

Receiver stores the note and private readiness preflight inside authenticated encrypted Node envelopes. Public staged status exposes phase, version, readiness boolean/expiry and the initial commitment, while omitting the note, sender message/signature, resolved accounts and amount. The accepted readiness attestation and its Receiver lease context remain stable across attachment so Node can validate the saved private preflight before final wire checks. `FUNDING_READY` never permits a Cranker lease or wake. The operator still receives the original ingress body; encrypted storage does not establish operator blindness. Confirmed funding gates independent verification of the settlement created at attachment.

Settlement exposes `fundingRootAccount`, the canonical global `tcap:funding-root:v1` PDA, and thirteen proof public inputs; the funding root value is input index 12. The projection excludes note commitment, secret, blinding and funding membership paths. Before storing a native authorization, Receiver filters its transition and nested proof fields and requires the public transition commitment to match the Node-verified work. New funding requires the funded tree and matching thirteen-input verifier/proving artifacts; source checks do not establish deployment or payment completion.

A single genuine confirmed deposit supports credit without creating a pool account or waiting for another depositor. The canonical global funding account authenticates current and up to 128 retained root/count records. New deposits within that window preserve funded membership; a retired root requires fresh unsigned verification. The latest shared head/nullifier state remains mandatory for one-time spending. Recognized unsigned retired-funding-root, shared-root, epoch, route or authorization-expiry conflicts may request authenticated `POST /api/cranker/work/retry` with current ID/version and the exact allowed reason. Receiver checks active lease, no execution checkpoint, confirmed funding and immutable lineage. It requires fresh verification with the same note/nullifier; saved signatures require receipt reconciliation.

For unsubmitted REJECTED work, the authenticated Node-service retry also admits the exact former error `GPRU transaction record is missing its twelve public hidden-head inputs` after loading the corrected thirteen-input Node validator. It preserves the original confirmed funding and rejection history, then requires new verification/proving. See [settlement recovery](../../tsn-docs/sdk/troubleshooting.mdx) for supported failure boundaries.

## Expired Cranker confirmation reports

Authenticated work PATCH can reconcile a native CONFIRMED report after lease expiry or immediate expiry reclamation. Receiver requires the exact expired authorization/version, durable signed checkpoint and original reporting payer, then verifies finalized execution, both signatures, wire hash/size/blockhash, exact instruction/Memo, canonical accounts and the resulting TCAP root. Concurrent lease reclamation may change coordination fields, but no replacement attempt or changed authorization is accepted. This updates status/history only and does not renew signing authority or wake settlement execution.

Transient receipt/finality unavailability leaves work unchanged and the corrected Cranker retries the same report within a bounded window. Other receipt or authorization mismatches fail. For an existing FAILED receipt, the Node-service-authenticated reconciliation utility defaults to read-only verification; explicit execution repairs only Receiver status. See [the November 5 diagnosis, tests and command](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/references/TSN-OPERATOR-GUIDE-20261105.md#expired-cranker-confirmation-report).

Signed failed credit also holds the shared-root verification lock, so later confirmed funding can have settlement still `RECEIVED`. Node-service-authenticated `POST /api/internal/node/work/resolve-failed` can record nonexecution only when the expired authorized predecessor root/sequence remain unchanged in finalized TCAP state and the saved attempt also passes receipt-absence, blockhash-expiry, checkpoint and funding checks. Preview does not change storage. Explicit execution preserves `FAILED`, the original authorization/result/funding and history, records bound evidence and wakes dependent work after persistence; it does not requeue the old attempt. Null receipts alone, changed root/sequence, active authorization, stale versions and unavailable RPC retain the lock. See [the bounded evidence](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/DOCUMENTATION_STATUS.md#funding-confirmed-but-shared-root-verification-blocked-2026-11-14).

The isolated local JSON adapter retries transient Windows `EPERM`/`EACCES` while opening its exclusive lock: at most eight attempts with increasing delays totaling 1,120 ms. Those errors never trigger stale-lock deletion, and persistent failures remain errors. This source correction does not establish live service recovery; storage, lease and chain outcomes remain separate checks.

## Runtime boundary

Receiver can remain on Vercel with a private Cloudflare D1 JSON record store. Node and Cranker run as separate local workers and use authenticated Receiver APIs. Storage credentials stay only in Receiver and the private Worker; existing Node verification and Mother keys remain separate.

Receiver updates a payload-free revision after commits. Local Node observes it through bounded outbound reads and wakes its lanes. Native authorization/signing requests retain original Cranker fences. Cranker uses its existing authenticated polling loops; Firebase Realtime Database and wake-token authentication are retired.

## Hosted storage configuration

Production uses `TSN_RECEIVER_STORE=d1`, `TSN_RECORD_STORE_URL`, `TSN_RECORD_STORE_TOKEN` and `TSN_RECORD_STORE_NAMESPACE`. The namespace must be separately initialized or imported before use; missing storage fails closed. Preserve existing `TSN_RECEIVER_NODE_API_KEY`, `TSN_RECEIVER_NODE_PAYLOAD_KEY` and `TSN_NODE_VERIFICATION_PUBLIC_KEY`. The record-store implementation and free-tier limits are documented in [storage contracts](lib/storage/record-store/README.md).

Cranker APIs use Ed25519 challenge-response to establish a short-lived Receiver
session. At session establishment, the Receiver reads the Mother Escrow and
operator Cranker PDAs from Solana Devnet and validates the operator, Mother
Escrow, and `sha256("tsn_dna" || mother || operator || protocol_seed)` against
the on-chain `dna_hash`. The session lasts at most 30 minutes and expires after
5 minutes without an authenticated request. Each API request remains signed by
the Cranker key and carries a strictly increasing session counter; the Receiver
checks that counter atomically to reject replayed requests without another
Solana RPC lookup. The session token is random, retained only in the Cranker
process, and stored by the Receiver only as a hash. A process restart, idle
timeout, or maximum session lifetime requires a fresh on-chain DNA check.

The Receiver does not maintain a per-Cranker allowlist and does not accept a
Cranker API key. Any operator may join by registering its own Cranker PDA
through the TSN protocol; no Receiver redeployment is required for operator
onboarding or rotation. The EVM wallet is a separate gas signer and is not the
Receiver admission identity. Legacy Cranker API-key authentication is disabled
and is not part of the deployment configuration.

After deployment, use the generated HTTPS URL as `TSN_RECEIVER_URL` in the
TSN Node and TSN Cranker. Internal API keys are for server-to-server calls
only; they must not be placed in browser-visible Vercel variables.

`TSN_NODE_VERIFICATION_PUBLIC_KEY` pins the Node's Ed25519 verification signer.
The Receiver rejects Node `FUNDING_READY`, `VERIFIED` or `REJECTED` transitions unless the
signature matches the current work, payload commitment, decision, and active
Node lease. Configure the same public key in the Cranker so it can independently
verify the receipt and the exact execution payload before submitting a
transaction.

## Receiver repository commands

Run `npm run git:commit:push:all` from this directory to capture Receiver files and publish to [bigdreamsweb3/tsn-receiver](https://github.com/bigdreamsweb3/tsn-receiver) on `main`, matching this package's `repository.url`. Review the directory's changes before launching the command. In a protocol/workspace checkout, the helper keeps a separate publication history inside the enclosing Git metadata and leaves its branch and index intact. A standalone Receiver clone uses its own Git history; the helper is included in this package and requires no parent scripts.

The first nested publication fetches the destination's existing `main` as its parent; an empty destination starts a Receiver root commit. Each publication mirrors the nonignored Receiver directory, including deletions. Remote-only files disappear from the resulting snapshot if they are absent locally. A failed push retains its local Receiver commit for retry; non-fast-forward updates require reconciliation and are never forced. `npm run git:pull:all` fetches only Receiver tracking metadata without merging or replacing source files. Secrets and local state remain excluded by this directory's ignore rules and private-filename checks.

## Local verification

Receiver follows the [MCES architecture](docs/architecture.md), with [component guidance](docs/engineering.md), a [source inventory](core/component_inventory.json) and [bounded verification](docs/verification.md). Runtime functions, methods and callbacks are isolated by responsibility with explicit dependency ports. The earlier canonical-storage checkpoint passed 72 isolated tests; the November 18 staged-funding checkpoint records its added tests, typecheck/audit and broader regression limits separately. Hosted D1 parity, final-source live latency and payment execution remain unverified.

In explicitly gated local mode, `TSN_RECEIVER_LOCAL_FILE` is a canonical ordered manifest backed by `<file>.d/epochs/<accounting-epoch>/<work-kind>/<id-sha256>.json`. Each work retains its full existing JSON row. Funding and TIN use `unassigned`; settlement remains unassigned until its stored verified transition supplies an accounting epoch. Metadata uses separate collection paths.

A missing anchor represents a fresh empty store; an existing monolithic anchor fails closed without conversion or backup creation. After initialization and pending-journal recovery, ordinary reads validate the complete manifest index and load only the requested row or collection. Mutations, initialization compaction and journal preflight retain full record validation. Protect the manifest, complete companion directory and lock together, including pending `transaction.json` recovery; see [local storage contracts](lib/storage/local/README.md) for validation and the commit boundary.

```bash
npm ci
npm run typecheck
npm test
```

TrustLink Labs maintains the protocol architecture. This repository contains
only the Receiver service and its private record-store integration boundary.

## Experimental private-credit and aggregate accounting

A single genuine confirmed deposit supports credit without creating a pool account or waiting for another depositor. The canonical global funding account authenticates current and up to 128 retained root/count records. New deposits within that window preserve funded membership; a retired root requires fresh unsigned verification. The latest shared head/nullifier state remains mandatory for one-time spending.

Individual credit keeps the actual amount in a fresh blinded commitment, updates current shared head/nullifier state and appends the blinded epoch transcript without reserve-liability reclassification. Node prepares complete ordered openings for separate `TCAP_EPOCH_ACCOUNTING`; Receiver coordinates versioned leases and Cranker submits the exact Mother-authorized accounting message. Complete accounting requires 2–64 accepted credits; a singleton carries forward. This accounting rule does not delay individual credit readiness.

Native hidden-head credit and epoch accounting receive a bounded 180-second Cranker lease covering Node authorization, Mother co-signing and submission. Node claims and funding/TIN/other-settlement Cranker claims remain 60 seconds. Signing requires the current active lease; expired unsigned work requires fresh verification, while a saved signature retains its reconciliation boundary.

For native credit and epoch accounting, Node validates the exact unsigned V1 message, verified transition and current lease before selecting the final confirmed blockhash. It changes only message bytes [8:40], revalidates the full message/hash in a positive nondecreasing bank context and synchronously rechecks lease limits before Mother signs. No awaited RPC follows the final validity check. Cranker verifies the Mother signature, authority, exact non-hash bytes and canonical positive lifetime/context metadata before payer signing. The final issuing context becomes `minContextSlot` for the 20-block margin check, preflight and height polling; Receiver durably checkpoints that final identity before broadcast. No recorded attempt or owner-signed deposit can be refreshed through this path.

Receiver preserves the exact domain 404 `Receiver work was not found`. Missing signing endpoints, transport/interrupted-body failure and HTTP 5xx can use configured fallback; exhaustion returns a sanitized signing-service 503. Exact signing/lifetime/height availability failures may requeue unsigned native work only under active owner/lease/version and no-checkpoint guards. Malformed metadata and signed attempts are excluded. Pool-specific recovery is retired.

Node must retain protected amount openings and matching credit/epoch artifacts. Existing version-1 global funding accounts require their explicit governance-authorized in-place migration after compatible program deployment. The circuit is unchanged solely for pool removal. Public deposit/aggregate amounts, singleton source linkage, timing, recipient/head history and Node knowledge remain privacy limits. [ABI](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/credit-abi.md) and [November 8 checks](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/experiments/EXP-20261108-remove-funding-pools.md) separate source/offline evidence from unperformed activation/live settlement.
