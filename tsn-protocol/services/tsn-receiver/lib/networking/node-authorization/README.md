# Node authorization forwarding

**Status: CURRENT structural implementation; live service and chain checks remain unperformed.** Receives the existing settlement/signature path union and request body. The exact Node work-not-found 404 and other responses below 500 remain terminal; route absence, server failure and body/transport failure try the next configured endpoint. Return values retain configured/response/nodeStatus; dependency messages and credentials remain excluded from diagnostics. Environment and fetch are explicit ports.

The [node-authorizations facade](../../node-authorizations.ts) retains the original public import and call signatures. Pure functions import named compatible components; stateful implementations take a typed, focused dependency selection. Production composition stays in the facade, and isolated callers can provide their own ports. Dynamic database values retain their original loosely typed shape in the shared [storage port contract](../../storage/ports.ts).

Each function or extracted callback has one implementation file. [COMPONENTS.json](COMPONENTS.json) lists those source interfaces and named dependencies. Shared Node URL normalization lives in networking/common; compatible Cranker reference and receipt account/proof callbacks are reused. Node decision canonicalization retains its distinct contract.

Existing verification references: [node-authorizations.test.mjs](../../../tests/node-authorizations.test.mjs). Tests are offline fixtures; their pass counts and remaining limits belong to the service verification record.
