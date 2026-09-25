# Receiver Storage Modes

The TSN Receiver has two deployment modes. Both modes expose the same Receiver
work contract; only the persistence adapter changes. The local JSON adapter is
selected explicitly by `TSN_RECEIVER_STORE=file`.

## Local development

Local development uses a JSON file so the Receiver can be run without Firebase
service-account credentials:

```env
TSN_RECEIVER_STORE=file
TSN_RECEIVER_LOCAL_FILE=.receiver-store.json
TSN_ALLOW_LOCAL_JSON_STORE=true
TSN_RECEIVER_NODE_API_KEY=1000000008
TSN_RECEIVER_NODE_PAYLOAD_KEY=<local 32-byte hex secret>
TSN_NODE_URL=http://127.0.0.1:8000
TSN_RECEIVER_PUBLIC_URL=http://127.0.0.1:8010
```

The JSON adapter must preserve the same operations as Firebase:

```text
receive()                 create idempotent RECEIVED work
leaseForNode()            RECEIVED -> NODE_VERIFYING
transition(node)          NODE_VERIFYING -> VERIFIED or REJECTED
leaseForCranker()         VERIFIED -> CRANKER_LEASED
transition(cranker)       CRANKER_LEASED -> SUBMITTED or CONFIRMED
```

Each write must be serialized. A repeated operation with the same ID and
payload commitment returns the existing record; the same ID with a different
commitment fails with `IDEMPOTENCY_CONFLICT`. A lease transition must verify the
owner, expiry, and expected state version before writing the next state.

The local file is runtime data and must remain ignored by Git. It is suitable
for local protocol testing and evidence capture only.

## Live deployment (`.env`)

The hosted Receiver uses the main `.env` file with Firebase and must not silently fall back to a local
file:

```env
TSN_RECEIVER_STORE=firebase
TSN_ALLOW_LOCAL_JSON_STORE=false
FIREBASE_PROJECT_ID=tsn-epoch-record
FIREBASE_CLIENT_EMAIL=<service account client email>
FIREBASE_PRIVATE_KEY=<service account private key PEM>
TSN_RECEIVER_NODE_API_KEY=<shared Node service credential>
TSN_RECEIVER_NODE_PAYLOAD_KEY=<shared 32-byte encryption secret>
```

The live process must fail startup when the Firebase server credentials are
missing or invalid. `FIREBASE_WEB_API_KEY` is used only for the public
cranker-wake flow when configured; it is not a substitute for the server
credential.

## Boundary and security rules

- The browser submits to Receiver ingress in both modes.
- The Node reads work through the authenticated Receiver lease API in both
  modes.
- The wake from Receiver to Node contains no work payload.
- The local JSON adapter must never be enabled by a hosted deployment.
- The Node API key and Receiver payload-encryption key must match between the
  local Receiver and local Node, but their values must not be committed.

## Verification

Before local testing, confirm the Receiver health endpoint reports the file
adapter and that `.receiver-store.json` is created after the first ingress.
Then confirm the Node log shows a local Receiver lease and the Receiver record
advances through `RECEIVED`, `NODE_VERIFYING`, and `VERIFIED`.
