# TSN Node by TrustLink Labs

Python-based stateless protocol verifier and processor for the Transfer
Settlement Network, operated by TrustLink Labs.

The plain-language explanation of what the Receiver stores, what the Node
verifies, and what a Cranker proves is in [TSN Receiver verification and
Cranker settlement](../../docs/tsn-receiver-verification-settlement.md).

## What it does

- leases received work from the TSN Receiver;
- verifies canonical authorization and routing evidence;
- returns verified or rejected evidence;
- delegates every durable state operation to the Receiver.

## Setup

```bash
pip install -r requirements.txt
python server.py
```

## Environment

Copy `.env.example` to `.env` and configure:
- `PORT` - Server port (default: 8000)
- `GITHUB_TOKEN` - GitHub token used to archive closed epochs
- `TSN_RECEIVER_URL` - Receiver base URL
- `TSN_RECEIVER_NODE_API_KEY` - Node-to-Receiver service credential
- `TSN_NODE_VERIFICATION_SIGNING_KEY` - dedicated Ed25519 private seed used to sign verification and rejection receipts
- `TSN_NODE_WAKE_TIMEOUT_MS` - Receiver wake request timeout (default `2500`)
- `TSN_PROGRAM_ID` - TSN settlement program id scanned for epoch treasury and `CrankerVault` accounts
- `TSN_RPC_URL` - Preferred endpoint for on-chain reads and settlement authorization checks; defaults to the TSN RPC gateway
- `EPOCH_HOURS` - epoch duration, default `7`

The production Node has no local JSON or direct Firebase store. Firebase belongs
to the TSN Receiver. Direct Firebase and JSON adapters require explicit
isolated-test flags and are not production fallbacks.

Operator daemon state files such as `operator-state.json` are private per operator and must never be read by the TSN Node. Liquidity is discovered by scanning the TSN program for public `CrankerVault` accounts, then querying each vault SPL token account balance on-chain.

## Signed verification receipts

The Node signs every `VERIFIED` and `REJECTED` decision with a dedicated
Ed25519 key. The receipt binds the work ID and kind, original Receiver payload
commitment, decision, verification evidence commitment, Cranker execution
payload commitment, Node lease, Node identity, key ID, and signing time. The
Receiver checks the signature and current lease before storing the decision;
the Cranker checks the signature and exact execution payload before submitting
work. This signing key is separate from settlement, route, owner, and Cranker
keys.

Generate one keypair locally, then configure the private value only in the
Node's environment and the public value in both Receiver and Cranker:

```bash
python -c "from nacl.signing import SigningKey; import base64; k=SigningKey.generate(); print('TSN_NODE_VERIFICATION_SIGNING_KEY='+base64.b64encode(bytes(k)).decode()); print('TSN_NODE_VERIFICATION_PUBLIC_KEY='+base64.b64encode(bytes(k.verify_key)).decode())"
```

Keep the private seed in the Node secret store. Never put it in Receiver,
Cranker, browser, or repository configuration. All three services must use the
same pinned public key; rotate it by updating the Receiver and Cranker pins
before switching the Node signer.

## API Endpoints

- `GET /api/mempool` - List pending transactions
- `GET /api/mempool/<tx_id>` - Get transaction details

## Deployment

The Node is a persistent service. Run it behind HTTPS on a VM or container
host; it is not a Vercel function. The included `Dockerfile` binds to the
platform-provided `HOST` and `PORT` values.

The Node stores durable work through the deployed TSN Receiver. It does not
own Firebase credentials or user private keys.

When no work is available, the verifier is event-sleeping: it makes no timed
Receiver/Firebase poll. The Receiver sends an authenticated, payload-free
`POST /internal/wake` after committing new work. The Node then drains the
queue and sleeps again. A single startup drain handles work that arrived while
the Node was offline. If the Receiver is unavailable or the service credential
is invalid, the Node uses bounded exponential backoff and returns to the same
event wait after six failed attempts instead of burning CPU indefinitely.
