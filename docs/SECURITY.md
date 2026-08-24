# TrustLink Pay security

TrustLink Pay separates identity, authorization, protected receiving routes,
and Solana settlement. Solana remains public; the goal is to reduce direct
payment-graph exposure and make authorized work verifiable, not to promise
invisibility.

## Security goals

1. Do not use a wallet address as the normal human-facing payment identity.
2. Protect private social and identity attributes.
3. Keep user seed material and child private keys on the authorized device.
4. Bind amounts, recipients, sources, fees, change, nonces, and expiry to a
   signed route.
5. Prevent replay, duplicate settlement, and unauthorized delegates.
6. Make Cranker execution observable and accountable.
7. Keep epoch treasury liabilities and one-time Mother DNA program-controlled.

## Component boundaries

- The root wallet authorizes the payment and device capability.
- The authorized device unlocks privacy-receiving-root and snapshot material
  locally; no GPRU route credential becomes a spend key.
- The TSN Node verifies, reserves, queues, and tracks public work.
- The Cranker pays fees and submits exact authorized transactions; it does not
  hold user keys or replan.
- The TSN Program verifies signatures, commitments, state, delegates, replay,
  opaque slot transitions, and exact vault reimbursement.
- Solana validators execute and confirm public Solana transactions.

## Privacy limits

TINs, GPRU routes, commitments, and separated settlement can reduce direct
wallet linkage. They do not automatically hide all SPL amounts, token-account
movements, timing, public exits, or graph-analysis signals. TrustLink Pay does
not promise complete anonymity.

## Operational secrets

Protect operator keys, deployment authorities, RPC credentials, and local
device credentials. Never paste private keys, seed phrases, or secret-key
arrays into public chats, logs, screenshots, dashboards, or evidence files.

## Failure handling

Invalid signatures, stale state, replayed nonces, expired routes, wrong
delegates, insufficient allowances, and commitment mismatches must fail closed.
Revoked devices must not decrypt new envelopes or sign new scoped operations.
