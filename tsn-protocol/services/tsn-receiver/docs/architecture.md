# Receiver modular architecture

**Status: CURRENT source organization, November 17, 2026.** Receiver adopts the [TSN Node reference](../../tsn-node/docs/architecture.md) through single-function TypeScript components, explicit dependencies and stable Next.js/library facades. Local JSON sorting is the separately requested behavior change. [Verification](verification.md) records offline evidence and its limits; source organization and stored work do not establish chain execution.

## Ownership and composition

`app/**/route.ts` retains the original HTTP methods, alias identities and `nodejs` declarations. Implementations live in [lib/http](../lib/http/README.md), with narrow per-route dependency declarations and composition. The two TSX entrypoints each retain one presentation function. Original flat `lib/*.ts` modules remain public interfaces to their functional implementations.

The families are contracts, work, service/Cranker authentication, Node-envelope/attestation security, Firebase/local persistence, Node key-value/private-credit state, Node authorization/proxy/wake networking, Cranker wakes and separate recovery packages. [The inventory](../core/component_inventory.json) maps files, functions, imports, signatures, dependencies and errors. Family READMEs identify component inputs, output, failure rules and tests.

Pure functions receive direct values; stateful functions receive focused ports or `Pick<Dependencies, ...>`. Original facades and route `runtime.ts` files select database, clock, configuration, transport and wakes. `StorageContext` owns filesystem paths, ports and lazy initialization; a storage-owned process registry shares FIFO queues and asynchronous lock ownership across module instances for the same path. Document/query/transaction/batch class shells attach named implementations. Some database and nested-payload boundaries retain `any`; the ports provide explicit dependency isolation without claiming complete static modeling.

## Stable contracts

Receiver owns durable ingress, encrypted Node payloads, versioned leases, Cranker admission, shared-root coordination, signed checkpoints and receipt/status reporting. Node retains verification/proving and Mother authorization; Cranker retains permitted submission. The MCES extraction retained program layouts, SDK contracts, service configuration and hosted Firebase record formats; the later funding context contract below is a separate coordinated interface repair.

[Work](../lib/work/README.md) implements staged funding ingress and atomic signed-deposit/settlement attachment, while preserving deferred-work pagination, lease selection/reclamation, monotonic versions and global-root locking. Confirmed funding still gates settlement verification. Supported kinds remain `AUTHORIZED_FUNDING`, `SETTLEMENT`, `TIN_OPERATION` and `TCAP_EPOCH_ACCOUNTING`; retained unsupported rows gain no execution eligibility.

Authenticated Node claims may add `fundingPhase: "SIGNED_DEPOSIT"` only with `supportedKinds: ["AUTHORIZED_FUNDING"]`. This bounded fast pass selects and reclaims only attached funding and rechecks its persisted phase inside the normal claim transaction. Invalid combinations fail before storage access; an empty signed queue returns no work. The ordinary pass retains accounting priority and all-kind reclamation. Node performs coordination and an ordinary claim after each fast pass, preserving accounting and other work progress. This scheduling change adds no execution authority, storage cache or bypass of global snapshot/journal validation.

[Contracts](../lib/contracts/README.md) preserve distinct public, authenticated Node and Cranker projections. Funded-note openings remain restricted to the existing encrypted Node envelope. Work commitments retain locale sorting; Node attestations retain codepoint sorting because merging these implementations changes canonical bytes. Authorization compaction, proof allowlists and saved signed-attempt identity remain intact.

Unsigned verification retry, successful-receipt reconciliation and corroborated expired-attempt nonexecution remain distinct recovery contracts. Missing receipts alone release no lock, and a saved signature permits no replacement attempt. Recovery package READMEs retain exact permissions and failure boundaries.

## Signed funding bank context

**Current staged contract, November 18, 2026.** New funding first persists a message-only `AUTHORIZATION` work with immutable `authorizationPayloadCommitment`; signed deposit/context fields are forbidden. Node's signed `FUNDING_READY` decision uses `TSN_FUNDING_AUTHORIZATION_READY`, empty Cranker execution projection and metadata `{expiresAt, authorizationPayloadCommitment}`. Receiver encrypts `authorizationPreflight`, retains `fundingReadinessAttestation` and `fundingReadinessReceiverLease` separately, and projects the private result only through authenticated Node reads. This state creates no settlement and cannot wake or lease a Cranker.

The Node-authenticated [attachment component](../lib/work/attach-signed-funding.ts) checks readiness, expiry, version and the original encrypted commitment before merging only the exact signed wire and tuple. Its transaction changes the completed `payloadCommitment`, marks `SIGNED_DEPOSIT`, returns work to `RECEIVED`, and creates settlement with the existing deterministic hash of funding ID and completed commitment. Exact attachment retries preserve the same work across later transitions; changed wires or tuples fail. Both the encrypted original and accepted readiness decision remain available for Node's final checks and later receipt lineage. Staged public status adds phase, version, readiness boolean/expiry and initial commitment without exposing amount or private preflight. Existing historical record projections remain separate.

[Attachment validation](../lib/contracts/validation/assert-sender-funding-blockhash-context.ts) requires `senderFundingBlockhashContext` with exactly a canonical nonzero 32-byte Base58 `blockhash`, positive safe integer number `lastValidBlockHeight`, and nonnegative safe integer number `contextSlot`. [Attachment](../lib/work/attach-signed-funding-transaction.ts) encrypts this tuple with the original funding payload; the canonical durable payload allowlist remains unchanged. Receiver checks shape and sender approval, while the client tuple itself is not authenticated proof of an issuing RPC bank.

[Funding evidence compaction](../lib/contracts/verification/compact-authorized-funding-verification.ts) preserves the verified tuple for [Cranker execution projection](../lib/contracts/projection/cranker-execution-payload.ts). That projection requires the tuple, rejects extra nested fields and enters the Node execution attestation commitment. Existing verified funding lacking context fails closed. [Confirmed receipt compaction](../lib/work/paymentReceiptVerification.ts) removes the tuple, wire and mode from execution evidence; the encrypted original remains separate, and confirmed funding and dependent settlement lineage retain their existing responsibilities. No operator record rewrite, missing-context submission fallback or signed-byte refresh is provided.

## Local epoch and work files

The explicitly gated local adapter keeps `TSN_RECEIVER_LOCAL_FILE` as its anchor, default `.receiver-store.json`. The anchor is an ordered manifest; individual documents live in its companion directory:

```text
.receiver-store.json                  manifest, no document payloads
.receiver-store.json.lock             exclusive PID/token lock
.receiver-store.json.d/
  epochs/
    unassigned/AUTHORIZED_FUNDING/<id-sha256>.json
    unassigned/TIN_OPERATION/<id-sha256>.json
    <accounting-address-label>--<digest16>/SETTLEMENT/<id-sha256>.json
    <accounting-address-label>--<digest16>/TCAP_EPOCH_ACCOUNTING/<id-sha256>.json
  metadata/<collection-sha256>/<id-sha256>.json
  transaction.json                    pending committed-write recovery
```

Epochs are existing asset-specific TCAP accounting account addresses. Accounting work uses its stored epoch; settlement uses its reconstructed verified credit transition or retained authorization. Funding and TIN always remain unassigned. Settlement without an authoritative accounting address stays unassigned until verification supplies one. Conflicting stored addresses fail closed. Timestamps, Node queue archive epochs, decrypted values and arbitrary Node-state strings do not determine placement.

Each work file retains its full existing row and exact ID. Hash filenames and digest-suffixed readable epoch labels prevent identifiers from becoming filesystem instructions. The first persisted work for another epoch creates another folder. Empty folders may remain after relocation or deletion; folder existence does not establish completion. Sessions, challenges, rates, state subcollections and root locks use metadata paths in the same store.

Manifest ordering preserves existing object insertion and query/cursor/limit behavior. A durable journal publishes the logical transaction; locked readers complete recovery before exposing rows. Relocation and deletion share that boundary. An error before publication leaves committed state unchanged; an error afterward requires roll-forward and may accompany an already committed request. Existing idempotency/version checks remain necessary. [Storage contracts](../lib/storage/local/README.md) explain validation, lock ownership and interruption behavior.

## Bounded storage work

Mutation and initialization-compaction snapshots, together with journal preflight, process at most sixteen records concurrently while retaining complete manifest/record validation. Results and errors follow manifest order. Each batch waits for all started operations, including failures, before the exclusive lock can be released. Reads, initialization and mutations share FIFO scheduling by resolved lock path. Waiting and native acquisition consume one ten-second acquisition budget; expired queued callbacks never execute later. Native cross-process exclusion and the TCAP accounting/unassigned directory layout and journal publication/recovery boundaries remain intact.

Ordinary point reads use [load-document.ts](../lib/storage/local/load-document.ts) to load only the requested indexed row. Ordinary queries use [load-collection.ts](../lib/storage/local/load-collection.ts) to load the requested collection in manifest order, then apply the existing filters, ordering, limit and cursor. Both recover a pending journal first and use [load-manifest.ts](../lib/storage/local/load-manifest.ts) to validate the complete index, including all manifest paths. Selected records retain file/path, JSON/object and row-placement checks. These reads use fresh data without a cache; they do not validate unrequested record contents. Transactions, initialization compaction and journal preflight retain global record validation.

Private credit inventory uses one query per page and projects funding from those returned rows through the same component as the public ID-based Node read. It no longer reloads storage for each funding work. [Coordination ownership](../lib/state/private-coordination/README.md) and [storage loading](../lib/storage/local/README.md#snapshot-loading-and-journal-preflight) describe the components; [verification](verification.md) records isolated performance and regression evidence. This repair requires no new operating step.

Cranker rate cleanup retains its existing stale-row filter and hundred-row bound, staging selected deletions in one batch instead of committing each row separately. Lease selection still reads funding separately for candidate settlements, but each ordinary funding read loads only its indexed row. Bulk retrieval would require a distinct review of concurrent funding eligibility and hosted Firestore behavior.

## Canonical initialization and engineering

Local initialization accepts only the canonical `TSN_RECEIVER_FILE_STORE` version-1 manifest and its referenced work/metadata files. A missing anchor represents an empty new store; the first durable commit publishes its canonical manifest and records through the journal. An existing monolithic anchor fails with `TSN_RECEIVER_LOCAL_MANIFEST_INVALID`, while malformed JSON or an unreadable anchor retains `TSN_RECEIVER_LOCAL_STORE_INVALID`. The adapter performs no automatic conversion or backup creation. Module import performs no filesystem operation, and existing verification-payload compaction remains separate. Tests use synthetic temporary stores without modifying operator state.

Import a pure implementation directly or supply its documented narrow ports in an isolated fixture. Preserve facade signatures, return/error contracts and exact bytes/transaction traces when replacing a component. Update inventories and package documentation after changes. [Engineering guidance](engineering.md) describes the service scope and test organization.

Generated Next files, dependencies, deployment manifests and diagnostic scripts remain tooling/integration boundaries. They are outside runtime extraction. Protect the canonical manifest, complete companion directory and lock together; `transaction.json` recovery remains part of normal locked operation. No new service, endpoint or external command is introduced.
