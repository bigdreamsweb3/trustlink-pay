# Unsigned native work retry

**Status: CURRENT structural implementation; live service and chain checks remain unperformed.** Receives current work, optional funding, version, owner, requester and recognized retry reason. It preserves unsigned current-lease checks, separate accounting payload commitment checks and funded settlement delegation. The clock is explicit. Signed checkpoints are not discarded or refreshed.

The [native-work-retry facade](../../native-work-retry.ts) retains the original public import and call signatures. Pure functions import named compatible components; stateful implementations take a typed, focused dependency selection. Production composition stays in the facade, and isolated callers can provide their own ports. Dynamic database values retain their original loosely typed shape in the shared [storage port contract](../../storage/ports.ts).

Each function or extracted callback has one implementation file. [COMPONENTS.json](COMPONENTS.json) lists those source interfaces and named dependencies. Shared Node URL normalization lives in networking/common; compatible Cranker reference and receipt account/proof callbacks are reused. Node decision canonicalization retains its distinct contract.

Existing verification references: [private-credit-coordination.test.mjs](../../../tests/private-credit-coordination.test.mjs), [settlement-retry.test.mjs](../../../tests/settlement-retry.test.mjs). Tests are offline fixtures; their pass counts and remaining limits belong to the service verification record.
