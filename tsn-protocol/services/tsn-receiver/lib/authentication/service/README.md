# Node service authentication

**Status: CURRENT structural implementation; live service and chain checks remain unperformed.** Receives a NextRequest and the existing node service selector. It checks the configured Node API key with the unchanged length check and timing-safe comparison. Its environment port is supplied by the auth facade. Missing or different credentials raise UNAUTHORIZED_SERVICE.

The [auth facade](../../auth.ts) retains the original public import and call signatures. Pure functions import named compatible components; stateful implementations take a typed, focused dependency selection. Production composition stays in the facade, and isolated callers can provide their own ports. Dynamic database values retain their original loosely typed shape in the shared [storage port contract](../../storage/ports.ts).

Each function or extracted callback has one implementation file. [COMPONENTS.json](COMPONENTS.json) lists those source interfaces and named dependencies. Shared Node URL normalization lives in networking/common; compatible Cranker reference and receipt account/proof callbacks are reused. Node decision canonicalization retains its distinct contract.

Existing verification references: [settlement-retry.test.mjs](../../../tests/settlement-retry.test.mjs), [failed-settlement-resolution.test.mjs](../../../tests/failed-settlement-resolution.test.mjs). Tests are offline fixtures; their pass counts and remaining limits belong to the service verification record.
