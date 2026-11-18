# Restricted Node payload envelope

**Status: CURRENT structural implementation; live service and chain checks remain unperformed.** Accepts the existing payload object or version-one IV/ciphertext/tag envelope. AES-256-GCM, 12-byte IVs, 32-byte hex/base64 key validation and base64url encoding remain unchanged. The key is read through an environment port at invocation. Unsupported versions, missing/invalid keys, authentication and non-object plaintext errors preserve their order. No new cryptographic guarantee is asserted.

The [node-envelope facade](../../node-envelope.ts) retains the original public import and call signatures. Pure functions import named compatible components; stateful implementations take a typed, focused dependency selection. Production composition stays in the facade, and isolated callers can provide their own ports. Dynamic database values retain their original loosely typed shape in the shared [storage port contract](../../storage/ports.ts).

Each function or extracted callback has one implementation file. [COMPONENTS.json](COMPONENTS.json) lists those source interfaces and named dependencies. Shared Node URL normalization lives in networking/common; compatible Cranker reference and receipt account/proof callbacks are reused. Node decision canonicalization retains its distinct contract.

Existing verification references: [node-envelope.test.mjs](../../../tests/node-envelope.test.mjs). Tests are offline fixtures; their pass counts and remaining limits belong to the service verification record.
