# Receiver Storage Modes

The TSN Receiver has two deployment modes. Both modes expose the same Receiver
work contract; only the persistence adapter changes. The local JSON adapter is
selected explicitly by `TSN_RECEIVER_STORE=file`.

## Local development

Local development uses an explicitly gated JSON file without hosted storage credentials:

```env
TSN_RECEIVER_STORE=file
TSN_RECEIVER_LOCAL_FILE=.receiver-store.json
TSN_ALLOW_LOCAL_JSON_STORE=true
TSN_RECEIVER_NODE_API_KEY=<shared randomly generated service credential>
TSN_RECEIVER_NODE_PAYLOAD_KEY=<local 32-byte hex secret>
# Local Node pulls Receiver work; no Node callback URL.
TSN_RECEIVER_PUBLIC_URL=http://127.0.0.1:8010
```

Both adapters preserve the same work operations:

```text
receive()                 create idempotent RECEIVED work
leaseForNode()            RECEIVED -> NODE_VERIFYING
transition(node)          NODE_VERIFYING -> VERIFIED or REJECTED
leaseForCranker()         VERIFIED -> CRANKER_LEASED
transition(cranker)       CRANKER_LEASED -> SUBMITTED or CONFIRMED
```

Each write must be serialized. A repeated operation with the same ID and
payload commitment returns the existing record; the same ID with a different
commitment fails with `IDEMPOTENCY_CONFLICT`. A lease transition must verify the
owner, expiry, and expected state version before writing the next state.

The local store is runtime data and must remain ignored by Git. It is suitable for isolated protocol testing and evidence capture only. The anchor selected by `TSN_RECEIVER_LOCAL_FILE` is an ordered manifest; full JSON rows live in `<file>.d/epochs/<accounting-epoch>/<kind>/<id-sha256>.json`. Epoch labels represent stored asset-specific TCAP accounting account addresses, with a digest suffix to distinguish case differences. Funding and TIN remain under `unassigned`; settlement moves from unassigned only when its existing verified transition provides an accounting epoch. Sessions, rates, Node state and root locks use separate metadata collection paths.

Each actual operation recovers a pending transaction journal under the filesystem lock before reading records. Journal publication is the logical commit: failure before publication leaves state unchanged, while failure afterward may mean the request committed and requires roll-forward. Runtime accepts only the canonical manifest and companion records. A missing anchor starts an empty new store; an old monolithic anchor raises `TSN_RECEIVER_LOCAL_MANIFEST_INVALID` without conversion, backup creation or replacement. Back up the manifest, complete companion directory and lock consistently with the Receiver quiescent. Do not delete a pending journal or edit work files manually. See [the component storage contract](../../../tsn-protocol/services/tsn-receiver/lib/storage/local/README.md) for path/damage validation and [bounded verification](../../../tsn-protocol/services/tsn-receiver/docs/verification.md) for tests and missing hosted/live checks.

Ordinary document reads validate the index and requested file; queries read only their collection, retaining query ordering and selected-record validation. Unrelated collection payloads do not block those reads. Initialization compaction, mutations, transactions and pending-journal preflight still validate all indexed records. Reads remain locked and uncached; shared FIFO scheduling reduces competing filesystem opens without guaranteeing a saturated queue meets its ten-second acquisition budget.

## Live deployment (`.env`)

The hosted Receiver uses D1 JSON records through a private Worker, selected by `TSN_RECEIVER_STORE=d1`. Configure `TSN_RECORD_STORE_URL`, `TSN_RECORD_STORE_TOKEN` and the initialized `TSN_RECORD_STORE_NAMESPACE`; preserve the existing Node credential and payload-encryption key. Missing metadata or indexed records fails closed. Production does not silently create an empty queue or fall back to workstation JSON. Firebase storage, credentials and its wake-token route are retired.

D1 stores individual JSON rows plus a namespace index/revision. A metadata fence and one transactional batch publish all changed rows together. Point reads fetch only metadata and the selected row in one snapshot; queries retain the existing filters/cursors. No automatic TTL applies to authoritative work or epoch history. See [record-store contracts](../../../tsn-protocol/services/tsn-receiver/lib/storage/record-store/README.md) and [free-tier checkpoint](../../references/FIREBASE-FREE-RECEIVER-20261125.md).

## Boundary and security rules

- The browser submits to Receiver ingress in both modes.
- The Node reads work through the authenticated Receiver lease API in both
  modes.
- Node observes a payload-free revision through outbound Receiver requests.
- The local JSON adapter must never be enabled by a hosted deployment.
- The Node API key and Receiver payload-encryption key must match between the
  local Receiver and local Node, but their values must not be committed.

## Verification

Before local testing, confirm the Receiver health endpoint reports the file adapter and that the manifest/companion records appear after the first actual storage operation. The health query itself can trigger guarded initialization. Inspect work through the existing Receiver endpoints or a manifest-aware locked reader; an old direct `store.tsn_receiver_work` parser cannot read the new format.
Then confirm the Node log shows a local Receiver lease and the Receiver record
advances through `RECEIVED`, `NODE_VERIFYING`, and `VERIFIED`.
