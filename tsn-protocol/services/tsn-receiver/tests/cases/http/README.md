# Receiver HTTP contract fixtures

The baseline fixture records synthetic observations from the pre-refactor route sources captured on November 17, 2026. It covers all 20 route modules and 35 exported HTTP method handlers, including methods that intentionally alias the same implementation. Source hashes identify the immutable baseline; the fixture stores no user state or real credentials.

The original/current differential ran 1,120 cases and found no differences. The permanent regression fixture retains each distinct response, dependency-call and diagnostic outcome per method, removing repeated equivalent observations. These cases characterize status/error mapping, input validation, public projection bounds, explicit Cranker execution projection, lease/retry forwarding, Node authorization failures, confirmation recovery, proxy path construction and mocked wake token exchange.

The test compiles only HTTP components and stable route facades into a temporary directory. Every runtime composition module receives synthetic ports; no Firebase, service runtime, local adapter or network implementation is imported. Global fetch is replaced with a synthetic responder and restored after each case. Function bodies, fixture helpers and mock response methods retain one implementation per file.

The suite verifies route behavior against captured observations, not hosted authentication, Firestore semantics, the Node signing service or chain receipts. Existing component tests separately verify those libraries' offline contracts. A deliberate public contract change requires reviewing the captured baseline rather than automatically regenerating expected outputs from the current implementation.

The November 18 staged-funding change preserves the original JSON baseline. `staged-http-expected.mjs` explicitly changes only the `/intents` POST validator dependency name to its message-only replacement. The fixture compiler permits the named pure public-readiness helper alongside HTTP components, while excluding runtime services. New staged tests separately cover attachment authentication, readiness privacy and exact settlement lineage; historical status fixtures remain unchanged.
