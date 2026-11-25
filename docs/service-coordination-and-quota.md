# TSN coordination and free-tier resource discipline

**CURRENT source: Firebase-free D1 JSON record store.** Receiver remains the authenticated coordination boundary, while a private Cloudflare Worker persists its JSON records in D1. Node stays local and initiates outbound connections. The [Firebase-free checkpoint](references/FIREBASE-FREE-RECEIVER-20261125.md) records tests and unverified deployment/quotas.

## State and authority

D1 holds work, leases, idempotency/replay state, encrypted ingress, verification evidence and results. The storage Worker performs bounded authenticated reads and exact metadata-fenced atomic SQL batches. It has no Node/Mother signing keys or payload-encryption key. Existing Node decisions and chain checks determine eligibility; a storage write or notification is not settlement.

Receiver updates a payload-free Node activity revision after durable commits. Node observes it through bounded outbound synchronization and retains a safety drain for missed hints. Its funding/signing/public handlers sleep after draining their lanes. Existing Cranker funding/native loops use wallet/session-authenticated polling. Receiver stores a nonce/kind/time control marker for coordination diagnostics; it is not a work payload or execution authority. Firebase Realtime Database and wake-token authentication are retired.

## Quota and failure behavior

Cloudflare D1 Free currently provides 5 million row reads/day, 100,000 row writes/day and 500 MB per database; aggregate account storage and Workers request/CPU quotas also apply. These are provider limits, not a measured capacity result for this deployment. Free quotas stop queries when exceeded. Monitor actual usage before treating the deployment as available for sustained traffic.

Indexed point reads use one Worker request and one SQLite snapshot for the namespace metadata and requested record. Queries preserve existing Receiver comparisons/order/cursors and load record pages; large collections can increase rows read. Transactions retry detected concurrent metadata changes only. Unknown commit responses propagate for reconciliation and never automatically repeat signing or submission.

Relay cleanup expires active admission and removes bounded terminal relay records after retention. Do not delete open epochs, unresolved signed attempts, authoritative root/nonce state or private opening backups to fit a free tier. Completed accounting and recovery/history obligations must be resolved before a separately reviewed archival policy removes records. The current change adds no general epoch deletion command.

## Configuration and verification

Only Receiver and the private Worker share the storage token. Node keeps its existing Receiver credential and verification seed; Cranker keeps its registered wallet/session identity. Browser clients receive no storage credential. D1 source, real in-memory SQLite tests, Receiver build, hosted D1 verification and live payment evidence are distinct checks. Internal provisioning/import steps remain in the run-your-own guide and are operator-controlled.
