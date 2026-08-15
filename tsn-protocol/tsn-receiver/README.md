# TSN Receiver by TrustLink Labs

The TSN Receiver by TrustLink Labs is the durable Firebase-backed ingress,
status, and work-publication service for the Transfer Settlement Network
(TSN). It accepts public payment and TIN-operation submissions, preserves
non-secret work records, leases work atomically, and publishes final status
and transaction evidence.

The Receiver is not the TSN Node and is not a Cranker. It does not verify
cryptographic plans, decrypt TIN data, derive ZK-PRUs, sign transactions, or
hold protocol authority.

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

## Deploy to Vercel

Create a separate Vercel project from this repository. Vercel Root Directory
must be the repository root. Set all values through Vercel Project Environment
Variables; never commit a `.env.local` file.

Required server-only variables:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
TSN_RECEIVER_NODE_API_KEY
TSN_RECEIVER_CRANKER_API_KEY
```

Optional variables:

```text
TSN_RECEIVER_COLLECTION=tsn_receiver_work
TSN_RECEIVER_STATE_COLLECTION=tsn_receiver_state
TSN_NODE_URL=https://<your-tsn-node-domain>
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
