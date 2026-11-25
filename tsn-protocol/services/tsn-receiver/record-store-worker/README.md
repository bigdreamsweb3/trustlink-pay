# Private D1 JSON record store

This Worker stores JSON records for the Receiver on Cloudflare D1 (SQLite). Receiver can remain on Vercel; Node remains local with outbound Receiver connections. The Worker has no Mother key, Node signing seed or payload-encryption key. STORE_TOKEN is a separate server credential shared only with Receiver. It exposes bounded authenticated read and compare-and-commit operations, not arbitrary SQL or commands.

The production schema uses primary-key record reads and an exact metadata fence. D1 batch is transactional: its first guard rejects missing or changed metadata before record/index writes. Every batch either commits its new namespace revision and changed records or rolls back. No automatic TTL applies to work, epochs, leases or signed attempts. Existing Receiver guards still determine which records may be deleted. The unused Firebase wake-token route is retired; Cranker retains authenticated polling.

The Worker retains one guard row per namespace and updates it through an upsert. The existing BEFORE INSERT trigger validates the expected metadata before SQLite resolves the primary-key conflict. This removes the guard deletion and repeated guard insertion from later commits while preserving atomic stale-generation rejection. Deploy this Worker update before updating Receiver and reloading Cranker. The existing schema and D1 binding remain applicable.

Cloudflare D1 Free currently includes 5 million row reads/day, 100,000 row writes/day and 5 GB aggregate account storage, with 500 MB per database. The Workers Free limit also applies. Free quotas stop operations when exceeded; this is not unlimited storage or a performance promise. See https://developers.cloudflare.com/d1/platform/pricing/ and https://developers.cloudflare.com/d1/platform/limits/ . Local queries preserve the existing Receiver filter/cursor contract; large work collections can increase rows read.

## Verification

Tests execute the production schema, SQL statements and batch guard through real in-memory SQLite, with a synthetic D1 binding. They cover authentication, malformed keys, missing storage, exact atomic commits, stale-generation rejection and 100-record deletion. Receiver D1 relay tests cover private encryption, claims, original native generations, expiry, admission and lost mutation acknowledgements. No HTTP server, Cloudflare deployment or live chain transaction is started by these checks. Hosted D1/Workers parity and Vercel latency remain unverified.

Operational provisioning and migration stay in the internal repository guide. Do not initialize an empty namespace over existing work or delete signed/open epoch history to free space. Existing Firebase data must be exported and reconciled before the operator retires that old database; the source replacement does not delete it.
