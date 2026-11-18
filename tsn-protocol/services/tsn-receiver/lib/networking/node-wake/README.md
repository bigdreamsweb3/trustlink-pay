# Node control notification

**Status: CURRENT structural implementation; live service and chain checks remain unperformed.** Receives a reason string, normalizes configured primary/fallback URLs, removes duplicates, sends only the bounded reason marker and clears each attempt timeout. The environment and fetch transport are explicit ports. Failure remains a warning after durable work; it does not reject an accepted submission.

The [node-wake facade](../../node-wake.ts) retains the original public import and call signatures. Pure functions import named compatible components; stateful implementations take a typed, focused dependency selection. Production composition stays in the facade, and isolated callers can provide their own ports. Dynamic database values retain their original loosely typed shape in the shared [storage port contract](../../storage/ports.ts).

Each function or extracted callback has one implementation file. [COMPONENTS.json](COMPONENTS.json) lists those source interfaces and named dependencies. Shared Node URL normalization lives in networking/common; compatible Cranker reference and receipt account/proof callbacks are reused. Node decision canonicalization retains its distinct contract.

Existing verification references: [settlement-retry.test.mjs](../../../tests/settlement-retry.test.mjs), [failed-settlement-resolution.test.mjs](../../../tests/failed-settlement-resolution.test.mjs), [settlement-reconciliation.test.mjs](../../../tests/settlement-reconciliation.test.mjs). Tests are offline fixtures; their pass counts and remaining limits belong to the service verification record.
