# Durable local Node relay

`runtime.ts` composes the private D1 record store, existing envelope encryption and pinned verification configuration. `validate-request` admits bounded existing API paths and headers; `request-hash` uses the canonical stable encoding. `enqueue` writes encrypted request identity plus activity revision in one transaction. Native jobs bind the original Cranker work/version/lease generation; public retry IDs require identical request bytes.

`claim`, `renew` and `complete` enforce exclusive versioned claims and absolute deadlines. Native claim/completion recheck the original Cranker scope. `reply-message` and `verify-reply` authenticate a separate domain-separated response attestation; this does not replace Mother signing or chain validation. Completed reports accept only exact replay. `wait-reply` closes snapshot watchers on completion/error/timeout; isolated local JSON uses bounded polling.

`request` waits 20 seconds for public calls or up to 120 seconds within the native lease, then returns `NODE_RELAY_PENDING` with an exact retry ID. `sync` observes a payload-free revision with a bounded 15-second watch. `signal-node` updates that revision after commits. `cleanup` runs at most once per minute, releases expired admission and deletes up to 32 terminal jobs past one-day retention. The job lane limit is 128 active requests; Record-store status queries use equality predicates compatible with the isolated adapter.

`http` requires the existing Node credential for GET sync, POST claim, PUT renewal and PATCH reply. Public `/node/<path>` retains handler authorization and forbids internal signing paths. Hosted Receiver uses transactional D1 JSON storage; Vercel cannot write workstation JSON directly. `maxDuration=180` is a source export, with deployed plan limits and real D1/Worker behavior still unverified.

`tests/node-relay.test.mjs` covers encrypted exact replies, mutations, claims, native fences, expiry, admission, authentication and synchronous watcher cleanup. No live service or payment result is inferred.
