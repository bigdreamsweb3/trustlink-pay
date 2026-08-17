# TSN Receiver by TrustLink Labs

The TSN Receiver by TrustLink Labs is the durable Firebase-backed ingress,
status, and work-publication service for the Transfer Settlement Network
(TSN). It accepts public payment and TIN-operation submissions, preserves
non-secret work records, leases work atomically, and publishes final status
and transaction evidence.

The Receiver is not the TSN Node and is not a Cranker. It does not verify
cryptographic plans, decrypt TIN data, derive ZK-PRUs, sign transactions, or
hold protocol authority.

For the exact payment-data retention boundary, Node verification checks, and
Cranker proof flow, see the repository guide: [TSN Receiver verification and
Cranker settlement](../../docs/tsn-receiver-verification-settlement.md).

State flow:

`RECEIVED -> NODE_VERIFYING -> VERIFIED -> CRANKER_LEASED -> SUBMITTED -> CONFIRMED`

The TSN Node is the only service allowed to move work from `RECEIVED` to `VERIFIED`. Crankers can lease only `VERIFIED` work. All leases and transitions use Firestore transactions and monotonic state versions.

## Runtime boundary

The Receiver is suitable for Vercel's Node.js runtime because it is an API
service, not a continuous worker. Firebase credentials and both service
credentials are server-only environment variables. Browsers receive none of
them.

The TSN Node and TSN Cranker must be deployed as separate persistent services.
They communicate with this Receiver through authenticated service endpoints.

The Receiver also sends an authenticated, payload-free `POST /internal/wake`
notification to the TSN Node after each durable work commit. The Node drains
the queue and then waits on its wake event; it does not poll Firebase or the
Receiver while idle. `TSN_NODE_URL`, `TSN_NODE_FALLBACK_URL`, and
`TSN_RECEIVER_NODE_API_KEY` configure this notification path.

When the optional Realtime Database wake channel is enabled, the Receiver also
writes a control marker to `tsn/crankerWake`. The marker contains only a nonce,
work kind, and timestamp. A Cranker opens an outbound authenticated Realtime
Database stream, receives the marker, then calls `/api/cranker/work` to lease
verified work from Firestore. Firestore remains authoritative for work,
leases, idempotency, replay state, and results; the wake marker is never a
work payload. If the channel is unavailable, Crankers use bounded fallback
backoff rather than failing a durable submission.

## Deploy to Vercel

Create a separate Vercel project from this repository. Vercel Root Directory
must be the repository root. Set all values through Vercel Project Environment
Variables; never commit a `.env.local` file.

Required server-only variables:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
FIREBASE_DATABASE_URL
FIREBASE_WEB_API_KEY
TSN_RECEIVER_NODE_API_KEY
TSN_RECEIVER_CRANKER_API_KEY
TSN_RECEIVER_NODE_PAYLOAD_KEY
```

All three Firebase variables are mandatory in the hosted Receiver. The service
does not fall back to Google application-default credentials, because a Vercel
function has no implicit Firebase identity. If any value is missing or the
private key has invalid newline escaping, durable state requests fail closed.

Optional variables:

```text
TSN_RECEIVER_COLLECTION=tsn_receiver_work
TSN_RECEIVER_STATE_COLLECTION=tsn_receiver_state
TSN_NODE_URL=https://<your-tsn-node-domain>
```

Deploy the Realtime Database rules from this repository after creating the
database in the Firebase project:

```bash
firebase deploy --only database
```

After deployment, use the generated HTTPS URL as `TSN_RECEIVER_URL` in the
TSN Node and TSN Cranker. Internal API keys are for server-to-server calls
only; they must not be placed in browser-visible Vercel variables.

## Local verification

```bash
npm ci
npm run typecheck
npm test
```

TrustLink Labs maintains the protocol architecture. This repository contains
only the Receiver service and its Firebase integration boundary.
