# TrustLink Pay Service Boundaries

## TSN Boundary

TSN lives at `/tsn` and owns Transfer Settlement Network protocol contracts and deterministic protocol logic.

Backend responsibilities:

- Validate TrustLink Pay users, payments, PINs, wallet ownership, and privacy proofs.
- Call TSN through explicit request/response contracts.
- Store TSN-returned intent, claim, proof, settlement, and cranker state in backend-owned tables.

TSN responsibilities:

- Define TSN intent, claim, settlement, proof, and cranker contracts.
- Own the cranker SDK and cranker runners under `/tsn`.
- Own the default TSN mempool where public intent and claim-request work is posted.
- Pin the verified TSN program ID in the SDK package, not in backend runtime config.
- Execute or expose protocol operations without importing backend repositories.
- Return protocol results to callers instead of writing to the backend database.

Forbidden dependency:

```text
/tsn -> backend/app/db
```

Allowed dependency:

```text
backend -> /tsn contracts/client/mempool
backend -> backend/app/db
```

TrustLink Pay may mirror TSN state into its own DB for product UX, but crankers must read work from TSN mempool, not from TrustLink backend tables.

## WhatsApp SDK Boundary

The WhatsApp SDK does not own TrustLink Pay persistence. It receives persistence ports from the backend at runtime.

Backend responsibilities:

- Implement WhatsApp SDK ports with backend repositories.
- Store webhook events, opt-in/out state, and payment notification status.

WhatsApp SDK responsibilities:

- Verify and parse WhatsApp webhook payloads.
- Send WhatsApp messages.
- Ask configured ports to read/write application state.

Forbidden dependency:

```text
trustlink-whatsapp-sdk -> backend/app/db
```
