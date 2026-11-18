# Node durable key/value and hash fields

The staged authorization path adds transactional `claim_once` with the existing key/field/value input. It stores a nonempty string binding and returns `{claimed: true}` when first created or when an exact stored string repeats; a different binding returns false. This lets one work ID and initial authorization commitment recover after a crash while excluding another work from the same nonce. `consume_once` retains its original one-use `{consumed}` semantics, including false on every repeat. Both operations share the existing hashed state field and transaction boundary.

**Status: CURRENT structural implementation; live service and chain checks remain unperformed.** Receives the existing operation/key/field/value/mapping shape. Hashed bucket/item identities, get/set/hash/delete operations and transactional consume_once remain unchanged. Collection, batch and transaction ports are explicit. Missing keys/fields and unknown operations retain their STATE errors.

The [node-state-store facade](../../node-state-store.ts) retains the original public import and call signatures. Pure functions import named compatible components; stateful implementations take a typed, focused dependency selection. Production composition stays in the facade, and isolated callers can provide their own ports. Dynamic database values retain their original loosely typed shape in the shared [storage port contract](../../storage/ports.ts).

Each function or extracted callback has one implementation file. [COMPONENTS.json](COMPONENTS.json) lists those source interfaces and named dependencies. Shared Node URL normalization lives in networking/common; compatible Cranker reference and receipt account/proof callbacks are reused. Node decision canonicalization retains its distinct contract.

Existing verification references: No dedicated baseline test exists for every branch in this package. The final Receiver verification record separates import/type checks from runtime integration.. Tests are offline fixtures; their pass counts and remaining limits belong to the service verification record.
