# TSN Receiver by TrustLink Labs

The TSN Receiver by TrustLink Labs is the durable Firebase-backed ingress,
status, and work-publication service for the Transfer Settlement Network
(TSN). It accepts payment and TIN-operation submissions, preserves narrow
coordination records and restricted encrypted Node payloads, leases work atomically, and publishes final status
and transaction evidence.

The Receiver is not the TSN Node and is not a Cranker. It does not verify
hidden-head proofs, decrypt owner identity records, sign transactions, or
hold protocol authority.

For the exact payment-data retention boundary, Node verification checks, and
Cranker proof flow, see the repository guide: [TSN Receiver verification and
Cranker settlement](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/architecture-map.md).

State flow:

`RECEIVED -> NODE_VERIFYING -> VERIFIED -> CRANKER_LEASED -> SUBMITTED -> CONFIRMED`

The TSN Node is the only service allowed to move work from `RECEIVED` to `VERIFIED`. Crankers can lease only `VERIFIED` work. All leases and transitions use Firestore transactions and monotonic state versions.

## Funded-note ingress and settlement projection

Native funding requires `senderFundingMode: "tcap_funded_note_v1"`, an exact owner-signed `deposit_private_funding_v1` transaction, and restricted `fundingNote: {version: 1, secret, blinding, commitment}` material. The three note values use canonical 32-byte BN254 scalar hex; secret and commitment must be nonzero. Receiver verifies the sender approval signature and field shape. Node independently checks the signed intent, note opening, asset/amount and exact deposit transaction before funding becomes executable.

Receiver stores the note only inside its existing authenticated encrypted Node envelope. Funding verification compaction, public status views and Cranker execution projections omit the note opening and recipient TIN. The operator still receives the original ingress body; encrypted storage does not establish operator blindness. A linked settlement reference is created at ingress, while confirmed funding gates its independent Node verification.

Settlement exposes `fundingRootAccount`, the canonical global `tcap:funding-root:v1` PDA, and thirteen proof public inputs; the funding root value is input index 12. The projection excludes note commitment, secret, blinding and funding membership paths. Before storing a native authorization, Receiver filters its transition and nested proof fields and requires the public transition commitment to match the Node-verified work. New funding requires the funded tree and matching thirteen-input verifier/proving artifacts; source checks do not establish deployment or payment completion.

Later deposits advance the funded root. For unsigned work, an exact Node authorization rejection `TCAP_FUNDING_ROOT_CHANGED_BEFORE_SETTLEMENT` requeues the settlement for fresh verification. The active Cranker lease owner can also request `POST /api/cranker/work/retry` with `{id, expectedVersion, reason: "TCAP_FUNDING_ROOT_CHANGED_BEFORE_SETTLEMENT"}` after its root preflight or Node co-signing rejects that root. Receiver checks ownership, lease expiry, state version, confirmed funding and immutable settlement lineage; it clears the obsolete verification/authorization and retains the original funding envelope so Node derives the same nullifier. Any persisted execution result prevents this retry; saved signatures require reconciliation.

For unsubmitted REJECTED work, the authenticated Node-service retry also admits the exact former error `GPRU transaction record is missing its twelve public hidden-head inputs` after loading the corrected thirteen-input Node validator. It preserves the original confirmed funding and rejection history, then requires new verification/proving. See [settlement recovery](../../tsn-docs/sdk/troubleshooting.mdx) for supported failure boundaries.

## Expired Cranker confirmation reports

Authenticated work PATCH can reconcile a native CONFIRMED report after lease expiry or immediate expiry reclamation. Receiver requires the exact expired authorization/version, durable signed checkpoint and original reporting payer, then verifies finalized execution, both signatures, wire hash/size/blockhash, exact instruction/Memo, canonical accounts and the resulting TCAP root. Concurrent lease reclamation may change coordination fields, but no replacement attempt or changed authorization is accepted. This updates status/history only and does not renew signing authority or wake settlement execution.

Transient receipt/finality unavailability leaves work unchanged and the corrected Cranker retries the same report within a bounded window. Other receipt or authorization mismatches fail. For an existing FAILED receipt, the Node-service-authenticated reconciliation utility defaults to read-only verification; explicit execution repairs only Receiver status. See [the November 5 diagnosis, tests and command](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/references/TSN-OPERATOR-GUIDE-20261105.md#expired-cranker-confirmation-report).

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
TSN_RECEIVER_NODE_PAYLOAD_KEY
TSN_NODE_VERIFICATION_PUBLIC_KEY
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

Cranker APIs use Ed25519 challenge-response to establish a short-lived Receiver
session. At session establishment, the Receiver reads the Mother Escrow and
operator Cranker PDAs from Solana Devnet and validates the operator, Mother
Escrow, and `sha256("tsn_dna" || mother || operator || protocol_seed)` against
the on-chain `dna_hash`. The session lasts at most 30 minutes and expires after
5 minutes without an authenticated request. Each API request remains signed by
the Cranker key and carries a strictly increasing session counter; the Receiver
checks that counter atomically to reject replayed requests without another
Solana RPC lookup. The session token is random, retained only in the Cranker
process, and stored by the Receiver only as a hash. A process restart, idle
timeout, or maximum session lifetime requires a fresh on-chain DNA check.

The Receiver does not maintain a per-Cranker allowlist and does not accept a
Cranker API key. Any operator may join by registering its own Cranker PDA
through the TSN protocol; no Receiver redeployment is required for operator
onboarding or rotation. The EVM wallet is a separate gas signer and is not the
Receiver admission identity. Legacy Cranker API-key authentication is disabled
and is not part of the deployment configuration.

Deploy the Realtime Database rules from this repository after creating the
database in the Firebase project:

```bash
firebase deploy --only database
```

After deployment, use the generated HTTPS URL as `TSN_RECEIVER_URL` in the
TSN Node and TSN Cranker. Internal API keys are for server-to-server calls
only; they must not be placed in browser-visible Vercel variables.

`TSN_NODE_VERIFICATION_PUBLIC_KEY` pins the Node's Ed25519 verification signer.
The Receiver rejects Node `VERIFIED` or `REJECTED` transitions unless the
signature matches the current work, payload commitment, decision, and active
Node lease. Configure the same public key in the Cranker so it can independently
verify the receipt and the exact execution payload before submitting a
transaction.

## Local verification

```bash
npm ci
npm run typecheck
npm test
```

TrustLink Labs maintains the protocol architecture. This repository contains
only the Receiver service and its Firebase integration boundary.

## Experimental private-credit and aggregate accounting

The current replacement hides individual credit amount in a freshly blinded commitment, keeps reserve liabilities unchanged on credit, and uses dedicated `TCAP_FUNDING_POOL` and `TCAP_EPOCH_ACCOUNTING` work. Node validates positive unspent captured members and source-wallet counts, prepares current-root proofs and complete ordered epoch openings; Receiver paginates/defer leases and serializes native verification; Cranker submits exact lease-bound Mother-authorized transactions. Pool capture needs two notes/two wallets, and complete accounting requires 2–64 credits. Common windows adapt to traffic; zero-value actors never qualify a pool. Signed uncertain attempts remain locked for exact finalized receipt reconciliation.

Node must retain its protected amount-opening journal and configure both credit and six `GPRU_EPOCH_*` artifact settings. Explicit credit rekey and separate epoch-verifier enrollment require matching keys. [ABI](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/credit-abi.md) and [offline evidence](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/experiments/EXP-20261107-private-credit-epoch.md) distinguish implemented checks from unverified SBF/activation/live payment. Deposit amounts, aggregate totals, metadata, Node knowledge and recipient/head correlations remain privacy limits; provider admission/rewards are outside this change.
