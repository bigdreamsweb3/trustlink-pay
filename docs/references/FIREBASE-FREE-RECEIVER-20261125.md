# Firebase-free Receiver storage — November 25, 2026

**CURRENT source, scoped offline verification; live D1/Worker deployment and migration UNVERIFIED.** The user rejected Firebase and Redis and required a free durable alternative. Cloudflare D1 stores Receiver JSON records through a private Worker, while Receiver can remain on Vercel and Node remains local with outbound connections. This supersedes the Firebase storage choice in the [local relay checkpoint](LOCAL-NODE-RELAY-20261125.md), preserving its relay/cache and funding-lane contracts.

## Current implementation

Receiver uses `lib/database.ts` and `lib/storage/record-store/` with `TSN_RECEIVER_STORE=d1`. It keeps individual JSON records and an indexed namespace revision. Point reads fetch namespace metadata plus one record in a single SQL snapshot/Worker request. Transactions compare exact original metadata, then a guarded D1 batch publishes every changed record and the new index together. Missing metadata, missing indexed records, corruption and unknown commit acknowledgements fail closed. Only detected concurrent changes can rerun a side-effect-free storage callback. No signed operation or transaction broadcast is automatically repeated.

The private Worker lives inside the standalone Receiver package at `record-store-worker/`. It exposes bounded authenticated read/commit operations with prepared SQL and an atomic SQLite guard. It holds neither Node/Mother keys nor Receiver payload-encryption material. Its independent service token belongs only to Worker and Receiver. The Node keeps its bounded local metadata/encrypted reply cache and existing authority/chain validation.

Firebase production composition/credentials, Node direct Firebase adapters and requirements, Firebase-only wake-token endpoint/debug helper, and Firebase rules/configuration are removed from source. Cranker retains its existing authenticated polling loops and signed counters; its control marker contains only nonce/kind/time. Existing program IDs, account/proof ABIs, signing keys, private environments, user-managed services and unrelated changes were preserved. No Redis backend remains. Historical test/evidence records and secret-filename protections retain their provenance.

## Free-tier and retention limits

The official D1 pricing page checked November 25, 2026 lists 5 million rows read/day, 100,000 rows written/day and 5 GB total account storage. The official limits page lists 500 MB per database on Free. Workers Free request/CPU limits also apply. On Free, exceeded quotas stop operations; no paid plan or account was created in this task. See https://developers.cloudflare.com/d1/platform/pricing/ , https://developers.cloudflare.com/d1/platform/limits/ and https://developers.cloudflare.com/d1/worker-api/d1-database/ for pricing and transactional batch behavior.

Runtime bounds namespace metadata to 768 KiB, each record to 1 MiB and a mutation request to 8 MiB. Large collections increase query rows/read cost; sustained hosted traffic/quotas are unmeasured. Existing relay expiry/terminal retention stays bounded. This change does not introduce general epoch deletion: open accounting, unresolved signed attempts, roots/nonces, private openings and recovery/history obligations cannot be discarded merely to free space.

## Verification

Receiver authored-source typecheck passed. The full serial Receiver suite passed 110/110 with no failures, errors or skips in 342.98 seconds. The final point-read optimization passed its nine D1 relay/transaction cases separately. Those checks cover encrypted replies, original native generations, mutation rejection, expiry, authentication, claims, atomic rollback, missing indexed records, uncertain acknowledgements and one-request point reads.

Four private-Worker tests passed using real in-memory SQLite with the production schema, prepared SQL and transaction guard. They verify authorization, malformed keys, missing storage, exact/stale atomic commits, 100-record deletion under batch limits and private import row preservation/conflict rejection. The binding wrapper models D1 batch using SQLite transactions; actual hosted D1/Workers behavior remains separate. No HTTP service was started for these tests.

The complete Firebase-free Node offline suite passed 181 of 185 tests with four existing matching-artifact circuit/Groth16 skips, no failures/errors and `sourceUnchanged=true`, in 205.06 seconds. All 565 remaining production Python files (393 functions) were AST-checked; the one-function/no-lambda rule passed. Private configuration and native artifacts were untouched.

The Receiver production build passed in an isolated temporary source copy with a node_modules junction, synthetic process-only settings, a temporary JSON store and one build worker. Existing live `.next`, private `.env` and Receiver state were untouched. The new D1 Worker source passed Node syntax; this does not deploy a Cloudflare binding. Documentation checks compiled 106 MDX files and parsed 40 Mermaid diagrams with zero failures. All four links introduced by retiring source names were repaired; the repository link audit retains 26 earlier missing overview-page/publication-rule findings outside this storage task. CRLF-aware diff checks passed. These checks do not verify visual rendering or hosted endpoints.

## Operator handoff

Follow the [internal operating guide](../RUN-YOUR-OWN-TSN.md#firebase-free-storage-with-cloudflare-d1) to create a Workers Free D1 database, apply the schema and deploy the private Worker. Fill the real database ID/hostname yourself; none was invented or provisioned here. Use fresh empty initialization only when there is genuinely no existing work. Otherwise preserve all Receiver collections in a protected export and prepare the one-time SQL import offline using `record-store-worker/prepare-import.mjs`; metadata is published last and conflicts cannot silently overwrite records.

The importer accepts the canonical local manifest/companion records or `TSN_RECEIVER_JSON_EXPORT` version 1 collections. It is not a Firebase exporter and performs no network operation. Exporting existing hosted Firebase records and validating the completed D1 import remain operator responsibilities. Keep the old database intact until counts, encrypted payloads, original signatures, pending leases and unresolved epochs are reconciled.

Set `TSN_RECEIVER_STORE=d1`, `TSN_RECORD_STORE_URL`, `TSN_RECORD_STORE_TOKEN` and the matching `TSN_RECORD_STORE_NAMESPACE` in Receiver. Preserve the existing payload key, Node credential and public verification pin. Deploy updated Receiver source through its existing Vercel workflow, then reload the local Node/Cranker under operator control. No program upgrade, account migration or proving-key regeneration is needed. No deployment, real transaction signing/submission, service start/stop, cloud-resource deletion, commit or push was performed.

## Operator-created D1 database

The operator supplied a Cloudflare dashboard screenshot showing `tsn-receiver`, database ID `e6ac4e77-2e90-4971-a84a-303fab9e2a79`, zero tables and zero queries. The supplied dashboard URL identifies account `86b0dc77394ef6e4615a29f44b102989`. These are user-supplied UI observations; no API verification was performed. The local ignored `record-store-worker/wrangler.toml` now pins that account/database with binding `DB` and Worker name `tsn-record-store`. Wrangler was not found on the current shell PATH. Schema application, metadata initialization/import, storage token provisioning and Worker deployment remain unperformed; the next operator step is to execute the prepared schema in the D1 Console.
