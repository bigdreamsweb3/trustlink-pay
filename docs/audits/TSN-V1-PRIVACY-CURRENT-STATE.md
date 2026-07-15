# TSN V1 Privacy Current-State Audit

**Audit date:** 2026-07-14  
**Scope:** TrustLink Pay, TSN SDK, backend APIs and storage, TSN Mempool, Cranker, RPC Gateway, and browser clients  
**Assessment:** The TSN-owned device authorization and proof-of-possession boundary is implemented and verified. The complete settlement receipt, frontend, storage, rendering, and legacy-data migration remains incomplete.

## Executive assessment

Private settlement truth currently crosses the TrustLink Pay application boundary. Plaintext wallet addresses, settlement signatures, routing fields, and device private keys are persisted or returned through application-owned code. The existing privacy modules are partial prototypes and must not be represented as completed security controls.

The most serious confirmed findings are:

1. TrustLink Pay stores exportable privacy-view and privacy-spend private keys as plaintext JSON in browser `localStorage`.
2. Application-facing payment models and detail APIs return transaction signatures, settlement wallets, Cranker metadata, and TSN trace fields.
3. TrustLink Pay owns a React private-receipt renderer whose public props and render state accept decrypted receipt objects.
4. The TSN SDK `openPrivateView` contract returns a decrypted receipt object to its caller.
5. The encrypted-receipt serializer separates the AES-GCM authentication tag but does not persist it; deserialization creates an empty tag. Stored receipts cannot reliably pass authenticated decryption.
6. TSN private-session and encrypted-receipt endpoints require a fresh registered-device proof of possession and atomically consumed request nonce. Older application privacy paths remain outside this verified contract until migration.
7. The Mempool persists operational records containing authorization signatures, on-chain signatures, PRU selections, and routing data in Firebase or a local JSON store.
8. Cranker logs include transaction signatures, TINs, and settlement execution details.

These findings mean the current implementation does not satisfy the TSN V1 rule that applications never become custodians of private settlement truth.

## Current data flow

```text
TrustLink Pay React components
    |  payment records, detail traces, browser privacy keys
    v
TrustLink Pay backend APIs and PostgreSQL
    |  wallet addresses, signatures, destination routes
    v
TSN SDK payment and settlement contracts
    |  authorization and operational settlement objects
    v
TSN Mempool (Firebase or local JSON)
    |  intents, claims, proofs, PRU route selections and permits
    v
Cranker processes
    |  settlement transactions and operational logs
    v
TSN Solana programs and Solana public ledger
```

The TSN SDK now defines validated device-registration, on-chain TINS owner verification, proof-of-possession session, and ciphertext-retrieval contracts. The backend process hosts replaceable TSN persistence and transport adapters for these contracts. Terminal settlement receipt creation, frontend adoption, historical data migration, and private-view rendering are not yet connected end to end.

## Private field inventory

| Private information | Created or received | Persisted or cached | Exposed or rendered | Current control | Required migration |
|---|---|---|---|---|---|
| Sender and receiver wallets | Payment creation, claim, TSN settlement | PostgreSQL `payments`; receiver-wallet records | Payment APIs and frontend models | Viewer-role filtering only | Remove from application-safe contracts; place required settlement truth in encrypted receipts or internal TSN stores |
| Settlement destination wallet | Claim request and Cranker flow | PostgreSQL `claim_requests.destination_wallet`; Mempool work | Payment detail and mempool tooling | Worker/API-key boundaries in parts of TSN | Separate internal worker contract from public SDK; encrypt owner disclosure receipt |
| Transaction signatures | Backend, Mempool, Cranker, Solana submission | PostgreSQL payment and intent tables; Mempool records; logs | Payment detail `trace`, frontend explorer links | Role-based sanitization | Remove from app APIs/state and store only in encrypted receipt plus strictly internal operational records |
| PRU addresses and selections | Mempool route resolution | Mempool records and TIN route storage | Authorized route endpoints and worker permits | Route session or delegated platform signature | Restrict to worker-only contracts; never export through browser/application SDK |
| PRU secret keys | Derived in Mempool permit issuance | Returned transiently in worker permit | Cranker receives `secretKeyBase64` | Worker API key and signed permit | Keep server/worker-only, add strict package export separation, rotation, zeroization, and log tests |
| Sender wallet authorization | Frontend wallet signing | Backend and Mempool intent records | Internal contracts | Signature validation and expiry | Retain only where execution requires it; redact from application responses and logs; enforce nonce consumption |
| Device private material | TrustLink browser | Plaintext `localStorage` key bundle | Accessible to all same-origin scripts | None | Replace with TSN SDK-managed non-exportable WebCrypto/WebAuthn-backed credentials |
| Decrypted receipt | TSN SDK private-view prototype | Returned in SDK state; React ref/state boundary | TrustLink-owned receipt component | Timer-based reference clearing | Render only inside TSN-owned Web Components; host receives safe lifecycle states/events only |
| TIN and owner identity bindings | Device/session prototypes and backend | Raw `tin`, `user_id`, owner keys in session/device records | Service objects and logs | Basic lookup/signature checks | Use TIN and owner commitments at privacy boundary; canonical network-, audience-, device-, scope-, nonce-, and expiry-bound authorization |

## TrustLink Pay frontend findings

### Plaintext device keys in browser storage — critical

`frontend/src/lib/privacy-keys.ts` generates X25519 and Ed25519 secret material, serializes both private keys as hexadecimal strings, and writes the complete bundle to `window.localStorage` under `trustlink:privacy-key-bundle:v1`.

The live claim flow in `frontend/src/components/experiences/claim-experience.tsx` reads this bundle, derives receiver private keys, signs claim proofs, and uploads the complete bundle through `/api/identity/keys`. This is application-owned key custody and conflicts with both TSN V1 and the repository rule that private routing/key behavior belongs to TSN infrastructure.

Removal cannot be a blind deletion: this code participates in the legacy direct claim path. It must be replaced by an SDK-owned device and receiver-authorization flow before the legacy path is removed.

### Decrypted data crosses the host boundary — critical

`frontend/src/lib/tsn-private-view/types.ts` defines an `available` state containing `receipt: PrivateReceipt`. `frontend/src/components/tsn-private-view/TsnPrivateView.tsx` accepts a child render function receiving that state, and `TsnPrivateReceipt` accepts the plaintext receipt as a React prop.

Comments warning the application not to retain an object do not create a security boundary. React props, refs, debugging tools, instrumentation, and same-origin scripts can observe the object.

### Application-facing settlement traces — high

`frontend/src/lib/types.ts` and transaction-detail experiences contain wallet, escrow, TSN destination, assigned Cranker, and transaction-signature fields. These fields must be replaced with receipt identifiers and privacy-safe states.

## Backend and API findings

### Plaintext application storage — critical

The PostgreSQL schema and read/write modules persist:

- `payments.sender_wallet`, `receiver_wallet`, `released_to_wallet`;
- `payments.deposit_signature`, `release_signature`, `refund_release_signature`;
- escrow and vault addresses;
- `payment_intents.assigned_cranker_pubkey`, `escrow_tx_sig`, `claim_tx_sig`, `proof_tx_sig`;
- `claim_requests.destination_wallet`;
- user settlement, recovery, privacy-view, and privacy-spend public material;
- wallet-binding signatures.

The existing migration SQL only adds comments marking fields deprecated. It neither encrypts historical records nor removes verified plaintext copies, and therefore is not a completed privacy migration.

### Plaintext application responses — critical

`backend/app/services/payment-views.ts` performs viewer-role filtering but still returns private fields to the TrustLink application. The payment detail response includes deposit, release, escrow, claim, and proof signatures plus explorer URLs and settlement-wallet information.

Role-based API authorization is not equivalent to the required encrypted-device disclosure path: the application server and React client still receive plaintext.

### Privacy services are disconnected and incomplete — high

Backend device, session, and receipt service files exist, but no corresponding privacy API routes form a complete protocol. Confirmed weaknesses include:

- device registration accepts public keys and identity fields without the required canonical owner authorization validation inside the service;
- registration uses upsert semantics that can replace device keys for an existing identifier;
- device records use raw application user IDs and lack TIN commitment, owner authorization record, expiry, and required status semantics;
- sessions store raw TINs and create bearer tokens;
- session lookup is token-only and does not require per-request device signatures;
- logs include user IDs, raw TINs, and device IDs;
- receipt records lack operation ID, integrity commitment, wrapped-key policy, encryption version, and per-device key envelopes.

## TSN SDK findings

### Device identity prototype — critical

`tsn-protocol/tsn-sdk/src/device/index.ts` returns exportable TweetNaCl secret-key byte arrays. It does not provide platform-backed non-exportable storage. The authorization message does not bind all required fields, including chain ID, network, audience/origin, separate signing and encryption key fingerprints, and complete permission scope.

### Bearer session prototype — critical

`tsn-protocol/tsn-sdk/src/sessions/index.ts` creates bearer session tokens. Although initial device signatures are represented, sensitive receipt retrieval is not bound to a fresh request nonce and device proof of possession.

### Broken receipt serialization — critical

`tsn-protocol/tsn-sdk/src/encryption/index.ts` splits AES-GCM output into ciphertext and authentication tag. Its serialization format omits the authentication tag, while deserialization reconstructs an empty tag. The implementation also does not pass the required context as AES-GCM additional authenticated data.

### Public plaintext return contract — critical

`tsn-protocol/tsn-sdk/src/private-view/index.ts` returns `{ status: "available", receipt }` from `openPrivateView`. This makes the host application a plaintext recipient and must be replaced by a render-backend contract whose public state and events contain no receipt data.

### Worker secrets mixed with distributable SDK concerns — high

`tsn-protocol/tsn-sdk/src/private-settlement.ts` contains operational permit contracts including PRU secret-key material. Browser-safe SDK exports and internal worker-only modules require hard package boundaries so application consumers cannot import worker secret contracts accidentally.

## Mempool, Cranker, and RPC findings

The Mempool stores its operational state in Firebase when configured and otherwise in `tsn-protocol/tsn-mempool-backend/.mempool-store.json`. Records include wallet authorization signatures, on-chain signatures, PRU route selections, Cranker assignments, claims, proofs, and recovery work.

The Mempool legitimately requires some private operational truth to execute settlement, but it currently lacks the finalized separation among:

- internal worker API;
- application-safe summary API;
- authorized ciphertext receipt API.

The Cranker logs include raw transaction signatures, TINs, and settlement execution details. Examples include submitted-intent, mixed-funding, TIN-finalization, epoch-race, and recovery messages. These must be replaced with privacy-safe operation, intent, receipt, and error identifiers.

The RPC Gateway requires a separate route-by-route response audit. It must not proxy internal Mempool records to application clients.

## Browser storage, cache, analytics, and logs

| Surface | Confirmed state |
|---|---|
| `localStorage` | Contains plaintext privacy private keys in TrustLink Pay |
| React state/props | Private receipt type is explicitly supported; payment detail state contains settlement traces |
| IndexedDB | No approved TSN-owned non-exportable key persistence implementation identified |
| PostgreSQL | Multiple plaintext settlement fields confirmed |
| Firebase/local Mempool JSON | Operational private records confirmed |
| Redis | No active TSN privacy receipt implementation identified during this pass |
| IPFS | No approved encrypted receipt persistence implementation identified during this pass |
| Logs | Cranker signatures/TINs and backend privacy identity fields confirmed |
| Analytics/error reporting | Requires final sink-by-sink validation after shared redaction is enforced |

## Localhost versus external-device behavior

The confirmed root cause is device-local browser state, not a TSN authorization guarantee. The legacy privacy keys are generated and stored in the browser origin's `localStorage`. A localhost browser and an external device have different origins and storage containers, so the external device does not possess the key bundle created on localhost. The claim flow consequently reports a wrong-device or missing-key condition, while localhost can derive the expected receiver key.

This difference is evidence of an application-owned browser key silo. It is not permanent device authorization: there is no wallet-authorized device registry and portable owner-approved enrollment flow connecting the two environments.

## Existing mechanisms worth preserving conceptually

- Wallet Ed25519 message authorization already exists for payment and TIN intents.
- Mempool PRU route sessions include signature, nonce, timestamp, and purpose checks.
- Worker-only API-key checks and signed permits exist for parts of Cranker execution.
- SHA-256/HKDF/AES-GCM and X25519 libraries are already dependencies.
- Backend service boundaries for device, session, and encrypted receipt concerns exist, but require replacement contracts and integration.
- Shared observability code has sensitive-name patterns, but enforcement and regression tests are incomplete.

These mechanisms can inform the migration, but none individually establishes the finalized TSN V1 lifecycle.

## Architecture correctness assessment

| Requirement | Current result |
|---|---|
| Application never receives private plaintext | **Fail** |
| Ciphertext-only persistent receipt storage | **Partial: schema and retrieval contract verified; settlement writer and database migration not yet applied** |
| Wallet-root device authorization | **Pass at TSN authorization boundary; live frontend enrollment not yet connected** |
| Non-exportable device keys | **Partial: SDK Web Crypto generation verified; legacy TrustLink browser key path still isolated pending cutover** |
| Request proof of possession | **Pass for TSN private-session and encrypted-receipt endpoints** |
| Replay-safe canonical authorization | **Pass: issued challenge plus TIN, network, audience, device, scope, time, and atomic nonce binding** |
| SDK-owned framework-independent rendering | **Fail** |
| Application-safe lifecycle events only | **Fail** |
| Internal/application/ciphertext API separation | **Partial: TSN encrypted-receipt endpoint is separated; legacy application APIs remain** |
| Privacy-safe logging | **Fail** |
| Historical plaintext migration | **Fail** |
| Same implementation usable outside TrustLink Pay | **Partial: authorization/session contracts are TSN SDK-owned; private-view integration is incomplete** |

## Migration order

The safe dependency order is:

1. Freeze and version the public privacy contract: safe state/event types, canonical authorization serialization, and package export boundaries.
2. Implement TSN-owned device credentials and wallet-authorized registration with nonces and expiry.
3. Implement proof-of-possession sessions and authorized ciphertext retrieval.
4. Correct envelope encryption, AAD, authentication-tag persistence, key wrapping, integrity commitments, and per-device access policy.
5. Create receipts at terminal settlement stages inside TSN infrastructure.
6. Publish TSN-owned Lit Web Components and framework wrappers that do not emit plaintext.
7. Migrate TrustLink Pay to identifiers, safe summaries, states, and events only.
8. Split backend and Mempool internal, application-safe, and encrypted-receipt APIs.
9. Encrypt eligible historical records, verify migration, remove plaintext fields, and retain privacy-safe rollback metadata.
10. Enforce redaction and complete adversarial, portability, storage, state, and log tests.

## Security decisions required before receipt key migration

Two policies must be explicit because a silent choice could permanently weaken privacy or availability:

1. **Historical multi-device access:** whether a newly authorized device can read receipts created before enrollment. The safest default is future receipts only, unless an already authorized device performs owner-approved key rewrapping.
2. **Recovery:** whether loss of every authorized device makes historical private receipts permanently unreadable, or whether TSN supports an owner-controlled recovery envelope. A permanent Mempool master decryption key is rejected because its compromise would expose historical receipts.

Implementation can proceed on device/session contracts and ciphertext-only APIs while these policies are finalized, but production receipt wrapping and historical migration must encode one documented policy.

## Immediate conclusion

The repository contains useful privacy-oriented building blocks, but it currently has two competing architectures: legacy TrustLink-owned plaintext flows and disconnected TSN privacy prototypes. The migration must replace both with a single SDK-owned architecture. The previous audit's completed claims should not be used as evidence of privacy readiness.
