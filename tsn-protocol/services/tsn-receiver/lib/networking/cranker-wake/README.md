# Cranker control notification

**Status: CURRENT structural implementation; live service and chain checks remain unperformed.** Receives a reason string and publishes the existing nonce/kind/time marker only when the Firebase application and database URL exist. Application, environment and clock are explicit dependencies. Publication failure remains a warning after durable work is saved, with no payload or execution authority added.

The [cranker-wake facade](../../cranker-wake.ts) retains the original public import and call signatures. Pure functions import named compatible components; stateful implementations take a typed, focused dependency selection. Production composition stays in the facade, and isolated callers can provide their own ports. Dynamic database values retain their original loosely typed shape in the shared [storage port contract](../../storage/ports.ts).

Each function or extracted callback has one implementation file. [COMPONENTS.json](COMPONENTS.json) lists those source interfaces and named dependencies. Shared Node URL normalization lives in networking/common; compatible Cranker reference and receipt account/proof callbacks are reused. Node decision canonicalization retains its distinct contract.

Existing verification references: No dedicated baseline test exists for every branch in this package. The final Receiver verification record separates import/type checks from runtime integration.. Tests are offline fixtures; their pass counts and remaining limits belong to the service verification record.
