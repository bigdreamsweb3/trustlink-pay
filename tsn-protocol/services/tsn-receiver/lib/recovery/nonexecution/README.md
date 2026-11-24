# Expired signed nonexecution disposition

**Status: CURRENT structural implementation; live service and chain checks remain unperformed.** Receives work ID, expected version, saved signature and explicit preview/execute boolean. The original failed native credit with confirmed funding, or a failed paired TIN-Debit without a funding record, can receive a disposition only after authorization/blockhash expiry and an unchanged finalized predecessor root. Absence of a receipt alone is insufficient. Storage, RPC environment/fetch, Date and durable wake ports are explicit. Failed status, execution checkpoint, authorization and history remain retained.

The [failed-settlement-resolution facade](../../failed-settlement-resolution.ts) retains the original public import and call signatures. Pure functions import named compatible components; stateful implementations take a typed, focused dependency selection. Production composition stays in the facade, and isolated callers can provide their own ports. Dynamic database values retain their original loosely typed shape in the shared [storage port contract](../../storage/ports.ts).

Each function or extracted callback has one implementation file. [COMPONENTS.json](COMPONENTS.json) lists those source interfaces and named dependencies. Shared Node URL normalization lives in networking/common; compatible Cranker reference and receipt account/proof callbacks are reused. Node decision canonicalization retains its distinct contract.

Existing verification references: [failed-settlement-resolution.test.mjs](../../../tests/failed-settlement-resolution.test.mjs). Tests are offline fixtures; their pass counts and remaining limits belong to the service verification record.
