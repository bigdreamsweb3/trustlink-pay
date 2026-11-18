# Public Node proxy

**Status: CURRENT structural implementation; live service and chain checks remain unperformed.** Receives the NextRequest and relative Node path. It preserves forwarded headers, internal key, query string, GET/HEAD body omission, deduplicated fallback order and response status/content type. The existing unavailability detail string is retained. Environment and fetch are explicit ports.

The [node-proxy facade](../../node-proxy.ts) retains the original public import and call signatures. Pure functions import named compatible components; stateful implementations take a typed, focused dependency selection. Production composition stays in the facade, and isolated callers can provide their own ports. Dynamic database values retain their original loosely typed shape in the shared [storage port contract](../../storage/ports.ts).

Each function or extracted callback has one implementation file. [COMPONENTS.json](COMPONENTS.json) lists those source interfaces and named dependencies. Shared Node URL normalization lives in networking/common; compatible Cranker reference and receipt account/proof callbacks are reused. Node decision canonicalization retains its distinct contract.

Existing verification references: No dedicated baseline test exists for every branch in this package. The final Receiver verification record separates import/type checks from runtime integration.. Tests are offline fixtures; their pass counts and remaining limits belong to the service verification record.
