# Local Node outbound relay and resource controls — November 25, 2026

**Status: HISTORICAL storage-choice checkpoint; relay/cache source remains current.** The [Firebase-free replacement](FIREBASE-FREE-RECEIVER-20261125.md) removes the Firebase storage described below. Hosted deployment and live payment remain UNVERIFIED. The approved topology places Receiver/RPC remotely, keeps Node local with outbound connections and preserves Receiver transactional authority. This follows the [funding isolation checkpoint](FUNDING-ISOLATION-20261125.md), which remains dated evidence for independent funding lanes.

## Contract and implementation

Receiver replaces direct Node wake, public proxy and native authorization/signing callbacks with bounded encrypted jobs. `/api/internal/node/relay` authenticates Node sync, claim, renewal and attested reply. `/node/<path>` exposes existing application handler behavior; Receiver `/intents` remains authenticated Node ingress. Native jobs bind original Cranker work/version/lease at enqueue, claim and first completion. Work decision signatures, relay reply attestations and Mother chain authority remain distinct checks. No account, program instruction, circuit, proving key or artifact was replaced.

Node observes the Receiver revision and pulls three request lanes. It dispatches existing ASGI handlers in-process, while diagnostic/local-mode HTTP binds only to loopback and rejects remote peers. Fixed path/method/body admission, existing owner authorization, chain/root/proof validation and original lease checks remain mandatory. Outbound connectivity prevents a public Node listener but does not make network data immune to manipulation. Firebase still receives ingress and holds the envelope key; this is not a Receiver-blindness guarantee.

The local `.node-cache` stores at most 128 work summaries and 128 pending/uncertain reply files. AES-GCM reply encryption uses a separate HKDF-SHA256 domain from the existing verification seed, bound to the primary Receiver URL and job/request identity. Execution is reserved before dispatch, exact reply bytes are persisted before reporting, and acknowledged normal entries are removed after Receiver completion. Interrupted/corrupt reservations fail closed and remain for reconciliation; they never silently rerun a signing operation. Corrupt cursor metadata refreshes from Receiver and grants no work authority. Protected witness/opening backups remain separate obligations.

Receiver admits 128 active requests per lane. Relay claims last 60 seconds with renewal bounded to the absolute request deadline. Public calls wait 20 seconds per response and expire after 120 seconds; native calls wait up to 120 seconds within the original Cranker expiry. Pending responses expose only an exact opaque relay ID for two bounded SDK retries. Cleanup runs at most once per minute, releases expired admission and removes up to 32 terminal records beyond one-day retention. Deadlines are ISO strings managed by application cleanup, not Firestore TTL.

Credit, epoch and debit proving share one local lock. Child JavaScript heap defaults to 2048 MB and initial witness WASM to 8192 pages; supported ranges are 512–4096 MB and 1024–32768 pages. SnarkJS proving uses its single-thread option and child verification discovers one worker; artifact SHA256 checks stream with 1 MiB chunks. These values do not cap total RSS or establish responsiveness on the operator PC. Owner funding bytes and the existing twenty-block send guard remain unchanged.

## Offline evidence

The complete Node baseline ran 175 tests: 171 passed and four existing artifact-dependent checks skipped. Final source ran 185 tests: 181 passed, the same four skipped, no failures/errors and `sourceUnchanged=true`, in 107.35 seconds. Real HTTP is blocked by the suite. New cases cover cache restart, uncertain execution, hash/path admission, response binding, exact publication retry, loopback peers, lease-loss cancellation, cache corruption, shared resource arguments and corrupt cursor recovery.

Receiver type checking passed. Its full serial regression run completed 102 tests: 101 passed and one old direct-HTTP retry fixture failed. That fixture was converted to the durable transport stub, preserving stale-root, availability, domain404 and uncertain-attempt assertions; its isolated rerun passed. The six new relay cases passed within the complete run. No claim is made that the entire suite was rerun after the fixture-only correction.

SDK build passed, and four new exact-job retry tests passed. The full SDK suite ran 135 tests: 130 passed and five failures remain in untouched TIN seed-envelope/route/creation fixtures. Failures concern removed marker fields, an expected error message and changed GPRU ElGamal key/policy commitments. Those source/contracts were outside this transport task and were preserved; a pre-task SDK baseline was not captured. The streamed artifact hash/resource case passed. XP forwards all Node calls through the same exact-job retry helper with a 90-second request budget, replacing its former 10/30-second limits that could abort before a relay result. XP syntax passed; no UI service was started. The SDK browser bundle passed. Receiver production build passed in an isolated temporary source copy with a node_modules junction, synthetic process-only settings and protected temporary JSON store; its live `.next`, private `.env` and operator data were untouched. The isolated build limited Next build workers to one and compiled both new relay routes. Documentation validation compiled 106 MDX files and parsed 41 Mermaid diagrams with zero failures. Five typed SDK examples and thirteen offline scenarios passed. The repository-wide link audit retains 26 existing missing overview-page references/publication-rule findings outside this transport change; no replacement pages were invented. CRLF-aware Git diff checks passed. Syntax parsing does not establish visual rendering or hosted behavior.

## Operator handoff and remaining checks

Update the Receiver deployment from reviewed source using the existing operator publication/deployment workflow; preserve Firebase settings, credential/public pins and payload key. Do not provision a public Node URL. Vercel plan support for exported `maxDuration=180`, Firestore listeners, original-native-lease waits, hosted concurrency and interrupted publication require live testing. Production Receiver cannot write workstation JSON directly.

From the repository root in PowerShell, rebuild and then reload only the local processes you operate:

```powershell
npm run tsn:sdk:build
npm run tsn:sdk:browser:build
npm run tsn:node:dev
npm run tsn:cranker:start
```

The last two commands belong in separate terminals after the operator stops their prior instances. Configure Node `TSN_RECEIVER_URL` and `TSN_RPC_URL` to the intended hosted endpoints, preserve the cache/witness paths and existing keys, and enable the existing Cranker hosted Receiver selection deliberately. Hosted XP mode uses Receiver plus `/node`; local XP mode can use the loopback facade. Program deployment, account migration and key/artifact regeneration are unnecessary for this transport change. No service start/stop, deployment, real signing/submission, commit or push was performed in this task.

Live funding, settlement, original-signature reconciliation, owner recovery, Firestore parity and actual prover timing/RSS remain unverified. A slow PC, long wallet approval or slow RPC can still exhaust a signed funding hash; the canonical recovery preserves the original attempt and requires reconciliation before new sender approval.
