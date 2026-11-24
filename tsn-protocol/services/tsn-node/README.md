# TSN Node by TrustLink Labs

## Modular engineering pilot

The Node is organized into independently defined components with one authored function per Python source file. [Architecture](docs/architecture.md) maps the runtime and package boundaries; [original assessment](docs/original-assessment.md) records the starting structure and known defects; [AGENTS.md](AGENTS.md) establishes the scoped engineering rules. The existing `server.py` and `main.py` application interfaces, environment precedence, protocol encodings and operator startup commands are preserved.

Use `python -m testing.run_suite` from this directory for all available offline tests, with an installed compatible native library where required. The [verification tools](testing/README.md) describe output and proof-fixture limits. [Final verification](docs/verification.md) records the checks performed for this pilot.


Python-based stateless protocol verifier and processor for the Transfer
Settlement Network, operated by TrustLink Labs.

The plain-language explanation of what the Receiver stores, what the Node
verifies, and what a Cranker proves is in [TSN Receiver verification and
Cranker settlement](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/tsn-receiver-verification-settlement.md).

## What it does

- leases received work from the TSN Receiver;
- verifies canonical authorization and routing evidence;
- returns verified or rejected evidence;
- delegates every durable state operation to the Receiver.

## Setup

The existing requirements file contains minimum-version ranges without a reviewed complete hash lock. Automatic setup helpers are blocked before installation; direct pip and Docker builds require separate dependency review in isolation. Existing environments and runtime interfaces are preserved. See the [repository security record](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/REPOSITORY-SECURITY.md) for the current controls and unverified fresh-install boundary.

```bash
python server.py
```

## Environment

Copy `.env.example` to `.env` and configure:
- `PORT` - Server port (default: 8000)
- `GITHUB_TOKEN` - GitHub token used to archive closed epochs
- `TSN_RECEIVER_URL` - Receiver base URL
- `TSN_RECEIVER_NODE_API_KEY` - Node-to-Receiver service credential
- `TSN_NODE_VERIFICATION_SIGNING_KEY` - dedicated Ed25519 private seed used to sign verification and rejection receipts
- `TSN_MOTHER_AUTHORITY_KEYPAIR_PATH` - Mother authority Solana JSON keypair, kept only by the Node for signing validated TCAP settlement messages
- `TSN_NODE_WAKE_TIMEOUT_MS` - Receiver wake request timeout (default `2500`)
- `TSN_PROGRAM_ID` - TSNP settlement program id scanned for epoch treasury and `CrankerVault` accounts
- `TSN_RPC_URL` - Preferred endpoint for on-chain reads and settlement authorization checks; defaults to the TSN RPC gateway
- `EPOCH_HOURS` - epoch duration, default `7`

The production Node delegates durable work state to Receiver. Its local
root-addressed witness snapshots are a separate proving cache. Firebase belongs
to the TSN Receiver. Direct Firebase and JSON adapters require explicit
isolated-test flags and are not production fallbacks.

Operator daemon state files such as `operator-state.json` are private per operator and must never be read by the TSN Node. Liquidity is discovered by scanning the TSN program for public `CrankerVault` accounts, then querying each vault SPL token account balance on-chain.

## Automatic TIP witness synchronization

Native credit now uses `tcap_funded_note_v1`. The restricted request carries the wallet-generated private opening; Node verifies its commitment against the signed payment message and exact `deposit_private_funding_v1` transaction. Public attestations, Cranker execution, authorization responses and witness candidates exclude that opening. The circuit proves funded membership, exact asset/amount and the secret-derived nullifier. See [funded-note ABI](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/credit-abi.md) and [local verification/activation](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/experiments/EXP-20261103-funded-note-credit.md).

Node also reconstructs immutable `funding-<root>.json` snapshots from successful TCAP append events under the selected global funding root. They contain public leaf values only. A cached prefix must extend to the exact chain root/count; cold recovery requires retained append history. Recovery is bounded to 10,000 leaves and 10,000 scanned signatures. Missing receipts, incorrect membership and concurrent root changes stop proving. Rebuild stale proofs with the same opening/nullifier; signature-only pending deposits lack membership and require separate handling.

The current native adapter supports Poseidon arities 1–5 and must be rebuilt alongside the updated source. `GPRU_NATIVE_LIBRARY_PATH` optionally selects an absolute native-library file for isolated validation. Existing twelve-input keys require separate Mother-authorized verifier-layout migration at the same verifier PDA, plus fourteen IC uploads/enabling. TCAP config governance initializes the new funding root once. Existing settled head/nullifier state is preserved. Source changes do not reload services, replace configured artifacts or initialize chain accounts.

Set `GPRU_HIDDEN_HEAD_WITNESS_DIR` to the persistent local witness directory. Before credit proving, Node validates the snapshot for the confirmed TIP root or reconstructs missing route leaves from confirmed direct/staged TIN creation receipts. Append indices establish ordering; registry checks and exact root/count equality gate immutable publication. No wallet approval or transaction is generated by synchronization.

The RPC must retain the required creation receipts. Recovery uses a verified local prefix when available and otherwise starts at index zero, with a 10,000-route and 10,000-signature bound. Missing receipts, invalid bindings and concurrent root changes remain failures. A missing TCAP state snapshot is a separate condition. The explicit `scripts/sync-tip-witness.py` diagnostic shares the Node's canonical validation functions. Existing REJECTED work still requires Receiver's guarded settlement retry after loading the updated Node.

The Memo validator and full credit digest now require exactly thirteen public inputs. The former twelve-input length guard could reject a funded-note settlement before submission. Load the corrected Node and Receiver, then inspect/requeue only the original eligible settlement through the [settlement recovery procedure](../../tsn-docs/sdk/troubleshooting.mdx); preserve confirmed funding and its private envelope. Historical receipt decoding remains separate from runtime proof admission.

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

The Mother authority keypair is separate from the Node verification key and
must remain available only to the trusted Node process. The Cranker sends the
Node-verified settlement message to the Receiver signing route; the Node
checks the lease, transition and transaction contents before selecting a fresh
confirmed blockhash. It returns the Mother-signed message plus its final hash,
lifetime and context; only V1 blockhash bytes may change. Cranker validates that
response, signs as payer and submits with its own operator key.

## API Endpoints

`POST /intents` submits a payment intent to Receiver ingress. Authenticated `GET /intents` lists the Node's public intent projection, with an optional `status` filter, and `GET /intent-work` exposes pending intent work. The preserved HTTP contract also includes network, metrics, epoch and internal authorization routes; inspect `/openapi.json` for their exact models and authentication requirements.

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

## Blockhash verification and transient RPC failures

New funding starts with a message-only `/intents` request. Node verifies recipient, asset, authorization and advisory token balance before publishing signed `FUNDING_READY` evidence; no funding blockhash exists at this stage. The application retrieves owner-authenticated `/network/funding/readiness`, offers explicit approval, then obtains a fresh blockhash and submits the exact wallet-signed deposit through `/network/funding/complete`. Receiver attaches only that wire/context to the original intent; final verification reuses the signed preparation without consuming the nonce twice. Readiness alone cannot enable Cranker.

Before wallet signing, `/network/recent-blockhash` validates confirmed visibility and at least 100 remaining blocks, retaining the exact issuing tuple. It tries at most three candidates with four-second per-endpoint reads and nondecreasing minimum context. A normal candidate needs three RPC reads; exhausted candidates return HTTP 503. This signing headroom differs from Cranker's unchanged 20-block send margin. The worker gives one completed signed deposit a claim before epoch coordination, then preserves a coordination/ordinary-work turn. See the [deadline investigation](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/references/FUNDING-DEADLINE-20261118.md) for observed timing and verification limits; no signature lifetime or loaded-service latency guarantee is added.

Funding completion requires `senderFundingBlockhashContext` with exactly the prepared `blockhash`, positive safe-integer `lastValidBlockHeight` and nonnegative safe-integer `contextSlot`. Node binds its hash to the unchanged wire, signs the tuple into final Cranker execution evidence and simulates with confirmed commitment, signature verification and `minContextSlot`. The tuple is a routing hint, not an issuer signature or proof of nonexecution. Confirmed historical records remain readable; old pending work receives no invented readiness or context. See [the staged component contract](verification/work/README.md).

Node tries configured RPC endpoints. Hash rejection within the reported lifetime, malformed results and partial context/height/transport failure remain HTTP 503. Terminal hash rejection requires all explicit rejections and successful observed heights beyond that lifetime, followed by inspection of the original work/signature before fresh owner signing. HTTP 5xx/transport failures retry under the renewed active lease within the existing 600-second processing window. Validation/program failures remain terminal, and lease loss cancels reporting. Short hash fingerprints and bank-context diagnostics support correlation without signed-wire logging. Persistent prover settings, matching host libraries and initialized account state remain required; [failure recovery](../../tsn-docs/sdk/troubleshooting.mdx) preserves the original attempt.

## Experimental private-credit and aggregate accounting

A single genuine confirmed deposit supports credit without creating a pool account or waiting for another depositor. The canonical global funding account authenticates current and up to 128 retained root/count records. New deposits within that window preserve funded membership; a retired root requires fresh unsigned verification. The latest shared head/nullifier state remains mandatory for one-time spending.

Individual credit keeps the actual amount in a fresh blinded commitment, updates current shared head/nullifier state and appends the blinded epoch transcript without reserve-liability reclassification. Node prepares complete ordered openings for separate `TCAP_EPOCH_ACCOUNTING`; Receiver coordinates versioned leases and Cranker submits the exact Mother-authorized accounting message. Complete accounting requires 2–64 accepted credits; a singleton carries forward. This accounting rule does not delay individual credit readiness.

Native hidden-head credit and epoch accounting receive a bounded 180-second Cranker lease covering Node authorization, Mother co-signing and submission. Node claims and funding/TIN/other-settlement Cranker claims remain 60 seconds. Signing requires the current active lease; expired unsigned work requires fresh verification, while a saved signature retains its reconciliation boundary.

For native credit and epoch accounting, Node validates the exact unsigned V1 message, verified transition and current lease before selecting the final confirmed blockhash. It changes only message bytes [8:40], revalidates the full message/hash in a positive nondecreasing bank context and synchronously rechecks lease limits before Mother signs. No awaited RPC follows the final validity check. Cranker verifies the Mother signature, authority, exact non-hash bytes and canonical positive lifetime/context metadata before payer signing. The final issuing context becomes `minContextSlot` for the 20-block margin check, preflight and height polling; Receiver durably checkpoints that final identity before broadcast. No recorded attempt or owner-signed deposit can be refreshed through this path.

Receiver preserves the exact domain 404 `Receiver work was not found`. Missing signing endpoints, transport/interrupted-body failure and HTTP 5xx can use configured fallback; exhaustion returns a sanitized signing-service 503. Exact signing/lifetime/height availability failures may requeue unsigned native work only under active owner/lease/version and no-checkpoint guards. Malformed metadata and signed attempts are excluded. Pool-specific recovery is retired.

Node must retain protected amount openings and matching credit/epoch artifacts. Existing version-1 global funding accounts require their explicit governance-authorized in-place migration after compatible program deployment. The circuit is unchanged solely for pool removal. Public deposit/aggregate amounts, singleton source linkage, timing, recipient/head history and Node knowledge remain privacy limits. [ABI](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/credit-abi.md) and [November 8 checks](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/experiments/EXP-20261108-remove-funding-pools.md) separate source/offline evidence from unperformed activation/live settlement.

## TIN-Debit

The [debit package](settlement/debit/README.md) implements sender-approved debit and offline recipient credit through a separate 26-input proof. Owner-authenticated `/network/tin-debit/prepare` precedes signed-opening `/network/tin-debit` ingress; Receiver stores the request privately, while Node signs only an exact verified public transition under its current lease. The recipient supplies no opening or signature. Existing wallet deposit-credit and epoch paths remain distinct. Refer to the verification record for completed local checks and pending artifact/deployment/live evidence.
