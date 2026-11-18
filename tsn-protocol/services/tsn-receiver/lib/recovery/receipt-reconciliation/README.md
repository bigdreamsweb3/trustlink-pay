# Finalized signed receipt reconciliation

**Status: CURRENT structural implementation; live service and chain checks remain unperformed.** Receives failed work identifiers or an expired payer report. It validates the exact V1 wire/signatures/accounts/permissions/proof/Memo and finalized chain account context, with separate credit and accounting layouts. Wire headers are decoded completely before instruction bodies, preserving parser/error ordering. Storage, RPC environment/fetch, Date and durable wake ports are explicit. Transactional context rechecks precede status repair; no submission, signing or replacement payment occurs.

The [settlement-reconciliation facade](../../settlement-reconciliation.ts) retains the original public import and call signatures. Pure functions import named compatible components; stateful implementations take a typed, focused dependency selection. Production composition stays in the facade, and isolated callers can provide their own ports. Dynamic database values retain their original loosely typed shape in the shared [storage port contract](../../storage/ports.ts).

Each function or extracted callback has one implementation file. [COMPONENTS.json](COMPONENTS.json) lists those source interfaces and named dependencies. Shared Node URL normalization lives in networking/common; compatible Cranker reference and receipt account/proof callbacks are reused. Node decision canonicalization retains its distinct contract.

Existing verification references: [settlement-reconciliation.test.mjs](../../../tests/settlement-reconciliation.test.mjs). Tests are offline fixtures; their pass counts and remaining limits belong to the service verification record.
