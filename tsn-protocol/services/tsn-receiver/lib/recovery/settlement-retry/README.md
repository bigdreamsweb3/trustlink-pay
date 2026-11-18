# Funded settlement retry guards

**Status: CURRENT structural implementation; live service and chain checks remain unperformed.** Receives current/funding work and expected version/requester or current lease owner/reason. It validates exact funding lineage and the existing repaired snapshot/Memo/asset or unsigned stale-proof reasons, then returns the original requeue patch and retained retry history. The Date constructor is explicit. Existing signed execution state remains ineligible.

The [settlement-retry facade](../../settlement-retry.ts) retains the original public import and call signatures. Pure functions import named compatible components; stateful implementations take a typed, focused dependency selection. Production composition stays in the facade, and isolated callers can provide their own ports. Dynamic database values retain their original loosely typed shape in the shared [storage port contract](../../storage/ports.ts).

Each function or extracted callback has one implementation file. [COMPONENTS.json](COMPONENTS.json) lists those source interfaces and named dependencies. Shared Node URL normalization lives in networking/common; compatible Cranker reference and receipt account/proof callbacks are reused. Node decision canonicalization retains its distinct contract.

Existing verification references: [settlement-retry.test.mjs](../../../tests/settlement-retry.test.mjs). Tests are offline fixtures; their pass counts and remaining limits belong to the service verification record.
