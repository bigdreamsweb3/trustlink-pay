# Receiver local JSON storage

This package owns the explicitly gated local JSON adapter behind [the stable facade](../../local-json-store.ts). It implements the existing document, query, transaction and batch interfaces. Hosted D1 selection, work contracts, privacy projections, protocol authorization and service configuration remain outside this package. Every implementation function or class constructor occupies its own file; class entrypoints attach named imported implementations.

## Context and initialization

[create-store-context.ts](create-store-context.ts) receives an optional file, work collection and filesystem port. It preserves working-directory path resolution and the existing environment/default names. [runtime.ts](runtime.ts) composes the default context without filesystem activity. [ensure-store-ready.ts](ensure-store-ready.ts) starts locked initialization on the first actual local read or mutation. Importing the adapter, including in hosted mode or source verification, performs no filesystem operation.

The configured `TSN_RECEIVER_LOCAL_FILE` remains the anchor. Its canonical format is a small JSON manifest:

```json
{"format":"TSN_RECEIVER_FILE_STORE","version":1,"collections":{"tsn_receiver_work":{"example":"epochs/unassigned/TIN_OPERATION/identifier-sha256.json"}}}
```

The filename above illustrates placement; actual document filenames are 64 lowercase hexadecimal SHA-256 characters followed by `.json`. The manifest contains collection names, exact document IDs and ordered relative paths, with no document payloads. Object iteration order retains the existing query and lease candidate contract. An update preserves position; deletion and later recreation follow the original JavaScript object ordering behavior.

## Record placement

[record-path.ts](record-path.ts) maps work documents to `${TSN_RECEIVER_LOCAL_FILE}.d/epochs/<epoch>/TYPE/<identifier-hash>.json`. Funding and TIN work use `unassigned`. Other work uses an existing nonempty accounting address from `payload.accountingEpoch`, reconstructed settlement `tcapCreditTransition.accountingEpoch`, or retained `authorization.transition.accountingEpoch`. Distinct stored addresses raise `TSN_RECEIVER_LOCAL_EPOCH_CONFLICT`; the adapter never invents a date or numeric epoch.

Known uppercase work kinds retain their type directory, including stored historical kinds. Other type values are encoded safely. Epoch folders retain a readable label plus a 16-character digest; the digest prevents ordinary case-only collisions on Windows. Exact values remain in the unchanged work record. IDs use full SHA-256 filenames, so separators, Unicode, reserved names and case differences do not become filesystem instructions. The validated manifest rejects duplicate record paths.

Non-work collections, including sessions, challenges, rate limits, global-root locks and Node-state subcollections, use `metadata/<collection-sha256>/<document-sha256>.json` under the same companion directory. The adapter preserves every existing collection and row. Storage classification grants no execution eligibility to retired work kinds.

## Atomic commits and recovery

[mutate-store.ts](mutate-store.ts), [perform-mutation.ts](perform-mutation.ts) and [with-file-lock.ts](with-file-lock.ts) retain one serialized locked snapshot for a transaction or batch. Transaction queries use that snapshot and observe the transaction's own staged writes. A callback rejection creates no journal and changes no committed record.

[build-journal.ts](build-journal.ts) records the complete next ordered manifest, changed rows and removed paths. It stores no second full database. [commit-snapshot.ts](commit-snapshot.ts) atomically publishes this durable journal at `${TSN_RECEIVER_LOCAL_FILE}.d/transaction.json`; journal publication is the logical commit. [recover-journal.ts](recover-journal.ts) atomically swaps individual changed JSON files, publishes the manifest, removes obsolete paths and finally removes the journal. Every read and mutation recovers an existing journal under the same lock before exposing records. Epoch relocation therefore changes record placement and index together.

A failure before journal publication leaves committed state unchanged. A failure afterward raises `TSN_RECEIVER_LOCAL_STORE_RECOVERY_REQUIRED`, retains the journal and requires roll-forward before the next read or write. A request may receive an error after the durable commit, so existing work/session idempotency and state-version checks remain necessary. Malformed journals, manifests or referenced records fail closed rather than replacing state with an empty store.

[write-atomic-file.ts](write-atomic-file.ts) flushes a temporary sibling and uses rename, retaining the bounded Windows access/busy retries. The journal, manifest and record files are flushed individually. Offline interruption tests establish adapter crash-recovery behavior; power-loss durability on arbitrary filesystems is not claimed.

## Snapshot loading and journal preflight

[ref-get.ts](ref-get.ts) delegates ordinary document reads through [read-document.ts](read-document.ts) and [load-document.ts](load-document.ts), loading only the requested indexed row. [query-get.ts](query-get.ts) delegates through [read-collection.ts](read-collection.ts) and [load-collection.ts](load-collection.ts), loading the requested collection in batches of at most sixteen records before applying existing query rules. A missing document retains the existing missing-snapshot behavior; a missing collection yields an empty query.

Both paths recover a pending journal under the shared lock before [load-manifest.ts](load-manifest.ts) validates the complete index and every referenced path. Selected records undergo the existing file/path, symbolic-link, JSON/object and exact record-placement checks, including accounting-epoch conflict refusal. Ordinary reads use fresh data without a cache and do not inspect record contents outside their selection. A query still reads its complete collection before filtering, ordering, limit or cursor evaluation.

Mutation and initialization-compaction [load-snapshot.ts](load-snapshot.ts) calls load every manifest record in batches of at most sixteen concurrent [read-snapshot-record.ts](read-snapshot-record.ts) operations. Results are assembled in manifest order, preserving collection/document iteration and transaction query ordering. Every record undergoes complete validation, so unrelated record damage still prevents a global snapshot or mutation. These snapshots remain fresh and uncached.

[validate-journal-records.ts](validate-journal-records.ts) applies the same sixteen-record bound to the complete resulting manifest before recovery applies writes. [validate-journal-record.ts](validate-journal-record.ts) uses staged data only for the exact journal write path and reads other referenced rows from disk. [complete-record-batch.ts](complete-record-batch.ts) waits for every started operation with `Promise.allSettled` before returning results or propagating the first error in manifest order. A rejected operation therefore cannot release the exclusive lock while other record work in its batch is still running. Journal publication, recovery and native token ownership remain unchanged.

The [private coordination package](../../state/private-coordination/README.md) projects funding rows from its already-read page, avoiding a separate storage read for each work. Recorded offline performance, regression checks and remaining live limits belong to the [service verification record](../../../docs/verification.md). This repair requires no new operator procedure or configuration setting.

## Canonical initialization

[load-manifest.ts](load-manifest.ts) accepts only a `TSN_RECEIVER_FILE_STORE` version-1 manifest. An absent anchor represents an empty new store; the first durable commit writes its canonical manifest and records. An existing monolithic `{collectionPath:{documentId:row}}` anchor is rejected with `TSN_RECEIVER_LOCAL_MANIFEST_INVALID`. Malformed JSON and unreadable anchors retain `TSN_RECEIVER_LOCAL_STORE_INVALID`. Rejection does not convert or replace the anchor, and the adapter creates no legacy backup.

[initialize-locked-store.ts](initialize-locked-store.ts) retains the existing verification-payload compaction on a validated canonical snapshot. Compaction failure retains the original deferred diagnostic behavior, while subsequent operations still validate and recover the store under lock. Pending `transaction.json` recovery remains required before records are exposed. Repository tests use explicit temporary contexts and do not read or replace an operator's active store.

## Lock and component contracts

The exclusive lock remains `${TSN_RECEIVER_LOCAL_FILE}.lock`. It contains a process ID and random ownership token. Access-denied opens retry up to the existing eight-attempt bound; they never prove staleness. [reclaim-stale-lock.ts](reclaim-stale-lock.ts) considers only old locks with valid metadata and no live owner. Unknown lock files and permission-protected/live owners remain blocking. [release-file-lock.ts](release-file-lock.ts) removes only its own token.

[queue-operation.ts](queue-operation.ts) schedules every local read, initialization and mutation in FIFO order for its resolved lock path before native acquisition. [get-lock-scheduler.ts](get-lock-scheduler.ts) shares queue tails and asynchronous ownership through a storage-owned process registry, including separately bundled module instances. [lock-queue-key.ts](lock-queue-key.ts) normalizes resolved paths and Windows case. Different paths remain independent; other processes still use the native exclusive lock.

Queue waiting and native acquisition share the existing ten-second acquisition budget. A queued ticket that expires rejects with `TSN_RECEIVER_LOCAL_STORE_BUSY` and never executes its callback later. Active owners retain their lock until the operation settles. [assert-lock-not-reentrant.ts](assert-lock-not-reentrant.ts) rejects same-path nested operations before awaiting even a pending initialization; detached asynchronous descendants may acquire after their parent's ownership ends. Saturated queues can still time out, and this budget does not cap complete HTTP requests or transaction execution.

The document components receive a reference, row and explicit snapshot/context and retain create/set/delete semantics. Query components receive filters, ordering, limit and cursor state and share [evaluate-query-snapshot.ts](evaluate-query-snapshot.ts) between ordinary and transaction reads. Existing comparison, limit slicing and cursor semantics remain intact. Transaction components mutate only their locked snapshot; batch components collect writes and clear them after successful commit. Snapshot components retain ID, existence, data and field access.

Filesystem ports, paths and lazy initialization belong to `StorageContext`; the storage-owned registry shares scheduling and asynchronous ownership for those paths. Storage functions receive their context explicitly; no implementation locates mutable application state through HTTP/server modules. The package exports no new HTTP or protocol API.

## Verification

Storage tests use recursively compiled source graphs in isolated temporary directories. The [storage suite](../../../tests/local-storage.test.mjs) covers fresh canonical initialization, old-format refusal without replacement or backup, lazy module imports, epoch placement/relocation/conflicts, interruption before and after journal publication, restarted-worker recovery, damaged records/journals and identifier/path safety. Selective-read checks distinguish complete manifest-path validation, selected-record validation and global mutation/journal validation. Existing local-adapter interfaces, lock retries, multi-worker exclusion, greater-than-200-row pagination, transaction own writes and rollback retain dedicated suites. Final non-emitting TypeScript validation and all 72 isolated tests passed with zero failures, cancellations or skips; exact commands and audit metrics belong to the [service verification record](../../../docs/verification.md).

The parent Receiver verification record separates historical checkpoints from final-source offline checks. Live HTTP latency, hosted Firestore parity, service availability, chain acceptance and production suitability of the guarded local adapter remain unverified. Operators must protect the anchor, companion directory, journal, temporary files and lock together; no sensitive state belongs in Git.
