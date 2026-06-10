# TSN Settlement Tokens, OTDT, Claim Leases, and Smart Recovery

> **Update reference:** introduced in the TSN runtime update at commit `dfa0735` (`TSN: Add settlement-token/OTDT, claim-lease & recovery runtime, and Python cranker daemon`). This document is the protocol-facing guide for that update.

## Summary

TrustLink Pay is built from three protocol layers and one operator layer:

- **TINS (Transfer Identity Number System)** gives users portable 10-digit payment identities and wallet abstraction.
- **SAS (Solana Attestation Service)** supplies trust credentials and verification results without placing personally identifiable information on-chain.
- **TSN (Transfer Settlement Network)** performs private, verifiable settlement through payment intents, escrow/vault accounting, Cranker verification, proof records, and recovery.
- **Crankers** are decentralized operators that verify intents, sponsor or execute settlement work, submit proofs, and keep TSN liquidity operational.

The `dfa0735` runtime update adds a TSN control plane around **encrypted settlement tokens**, **One-Time Decryption Tokens (OTDT)**, **claim points**, **claim leases**, a **commitment registry**, and **smart recovery**. The goal is to make each TSN transfer auditable and recoverable without storing sender wallets, recipient wallets, token balances, phone numbers, or decrypted settlement data in the public registry.

At a high level:

```text
TINS identity resolution
  -> TSN payment intent
  -> encrypted settlement token + commitment registry entry
  -> Cranker intent work
  -> claim points
  -> claim lease + OTDT
  -> settlement-token decryption in operator memory
  -> recipient payout/proof
  -> recoverable commitment registry state
  -> recovery queue
  -> smart recovery back to liquidity
```

---

## What changed in this update

| Area | New or modified behavior | Primary files |
| --- | --- | --- |
| Settlement-token primitives | Adds encrypted settlement payload creation, commitment hashing, Cranker DNA authorization, authenticated decryption, and OTDT hash generation. | `tsn-sdk/src/settlement-token.ts` |
| TSN mempool runtime | Adds commitment registry, claim-point ledger, claim leases, recovery queue, liquidity metrics, proof acceptance, and recovery completion. | `tsn-sdk/src/mempool.ts` |
| TSN HTTP operations | Adds endpoints for intent verification, claim leases, registry inspection, recovery queue inspection, liquidity metrics, and recovery completion. | `tsn-sdk/src/server.ts` |
| SDK contracts | Adds explicit types for registry entries, claim points, claim leases, recovery jobs, liquidity metrics, and proof metadata. | `tsn-sdk/src/contracts.ts` |
| Python Cranker daemon | Adds an autonomous Python scheduler for intent work, settlement work, OTDT-gated decryption, recovery enqueueing, and priority recovery. | `tsn-cranker-op-daemon/scripts/cranker_daemon.py` |
| Operator configuration | Adds settlement-token secret, Cranker DNA, low-liquidity threshold, and recovery reward settings. | `backend/.env.example`, `tsn-cranker-op-daemon/.env.example` |

---

## Concept map for lay readers

A normal payment app often stores or exposes a direct path such as:

```text
sender wallet -> recipient wallet
```

TrustLink Pay avoids making that direct wallet path the normal product surface. A sender pays a **TIN**, TSN records a **payment intent**, and Crankers complete settlement work through a proof-and-recovery workflow.

The encrypted settlement token can be understood as a sealed instruction envelope. The commitment registry stores the envelope and its hash, but not the private contents. A Cranker must first earn the right to work on claims, then receive a one-time decryption authorization before the envelope can be opened for settlement execution.

This gives the system three important properties:

1. **Privacy boundary:** the registry does not store sender wallets, recipient wallets, balances, phone numbers, or decrypted settlement tokens.
2. **Replay resistance:** claim leases and OTDT hashes prevent duplicate settlement attempts for the same transfer.
3. **Recovery accounting:** once settlement proof is accepted, recoverable state is derived from the commitment registry rather than a separate claimed flag.

---

## Components and responsibilities

### TINS

TINS remains the payment identity layer. Users share a 10-digit TIN instead of a wallet address. TSN receives a resolved route or recipient hash from the application/backend, but the commitment registry does not store the recipient's main wallet.

### SAS

SAS remains the verification layer. SAS attestations should be validated when recipient trust needs to be displayed or policy decisions need verified credentials. SAS must not place sensitive personal data in TSN registry records. Verification outputs should be reduced to trust decisions or attestation references.

### TSN

TSN owns settlement execution state:

- payment intents
- encrypted settlement-token commitments
- intent work
- claim points
- claim leases
- settlement proofs
- recoverable registry state
- recovery queue and recovery proofs

### Crankers

Crankers perform operational work:

- monitor TSN queues
- verify intent structure and signatures
- earn claim points through intent work
- acquire claim leases
- receive an OTDT hash before decryption
- decrypt settlement tokens only in memory
- perform settlement and proof submission
- complete recovery jobs when liquidity needs replenishment

---

## Settlement-token primitive

### Plaintext contents

The settlement-token plaintext is the private instruction payload that Crankers need for settlement execution. In the SDK implementation it contains:

```ts
{
  transferId: string;
  recipientHash: string;
  tokenMintAddress: string;
  amount: number;
  epoch: number;
  nonce: string;
  issuedAt: string;
}
```

This plaintext is **not** stored in the commitment registry. Its hash becomes the registry commitment.

### Encrypted envelope

The encrypted envelope records only data needed to verify and decrypt the token later:

```ts
{
  version: 1,
  algorithm: "TSN-HKDF-SHA256-STREAM-HMAC",
  salt: string,
  nonce: string,
  aad: string,
  aadHash: string,
  authorizedCrankerDnaHash: string,
  ciphertext: string,
  tag: string
}
```

Implementation note: the current TypeScript implementation uses Node.js cryptographic primitives and a deterministic HMAC-derived stream construction with an authentication tag. Production deployments should treat `TSN_SETTLEMENT_TOKEN_MASTER_KEY` as a high-value secret and rotate it through deployment secrets rather than committing it to the repository.

### Cranker DNA authorization

Cranker DNA is an operator authorization secret or policy input. The public envelope stores only a DNA hash:

```text
sha256("tsn-cranker-dna:" + TSN_CRANKER_DNA)
```

A Cranker whose DNA does not match the envelope cannot decrypt the token.

---

## Commitment registry

The commitment registry is the single source of truth for settlement verification and recoverability.

### Stored fields

A registry entry stores:

| Field | Purpose |
| --- | --- |
| `transferId` | Stable transfer identifier. |
| `encryptedSettlementToken` | Public encrypted settlement envelope. |
| `commitmentHash` | Hash of the decrypted settlement token. |
| `timestamp` | Time the commitment entered the registry. |
| `epoch` | TSN epoch used for accounting and recovery. |
| `recoverable` | Whether proof has been accepted and recovery is now permitted. |
| `intentVerifierPubkey` | Optional Cranker that completed intent verification. |
| `settlementCommitmentHash` | Hash committed after settlement proof. |
| `settlementProofTx` | Proof transaction or proof reference. |
| `otdtHash` | Hash of the one-time decryption token issued for the claim lease. |
| `recoveryProofTx` | Proof reference for recovery execution. |
| `updatedAt` | Last runtime mutation timestamp. |

### Explicitly forbidden fields

The registry must never store:

- sender wallet address
- recipient main wallet address
- decrypted settlement token
- token balance data
- phone number
- WhatsApp identifier
- SAS personally identifiable information

The current implementation keeps settlement destination details in claim requests and operator-local processing, not in commitment registry entries.

---

## End-to-end TSN flow

### 1. Identity and verification

1. Sender enters a recipient TIN.
2. TINS resolves the payment identity and route metadata.
3. SAS verification may be checked for recipient confidence.
4. WhatsApp may be used only as the social confidence/notification channel.

### 2. Payment intent creation

1. Backend or SDK creates a TSN payment intent.
2. The TSN SDK generates an encrypted settlement token when one is not supplied.
3. The intent is written to the mempool.
4. The commitment registry receives the encrypted token and commitment hash in the same mempool transition.

Example TypeScript flow:

```ts
import { JsonFileTsnMempool } from "@trustlink/tsn-sdk/mempool";
import { buildCreateIntentRequest } from "@trustlink/tsn-sdk/contracts";

const tsn = new JsonFileTsnMempool();

await tsn.postIntent(
  buildCreateIntentRequest({
    paymentId: transferId,
    recipientHash,
    tokenMintAddress,
    amount,
    source: "trustlink-pay",
  }),
);
```

### 3. Intent work

Crankers perform intent work before settlement work. Intent work validates:

- required TSN payment intent fields
- sender authorization and expiry when supplied
- encrypted settlement token presence
- commitment hash presence
- epoch/routing consistency
- registry entry existence

Successful intent work moves the intent to `escrowed` and credits the Cranker with claim points.

### 4. Claim points

Claim points represent useful work already performed by a Cranker. They prevent operators from skipping verification and going directly to settlement work.

```text
1 verified intent work item -> +1 claim point
1 claim lease acquisition -> -1 available claim point
```

### 5. Claim lease and OTDT

A Cranker must acquire a claim lease before settlement. Lease acquisition:

1. checks that the transfer is not already recoverable;
2. checks that no OTDT hash already exists;
3. checks that the Cranker has available claim points;
4. spends a claim point;
5. creates an active lease;
6. generates an OTDT hash;
7. writes the OTDT hash to the registry.

The OTDT hash is written before decryption so duplicate settlement attempts fail against registry state.

### 6. Settlement work

Settlement work uses the lease and OTDT state:

```text
active claim lease
  -> OTDT hash exists in registry
  -> settlement token decrypted in Cranker memory
  -> recipient payout / settlement action
  -> settlement commitment hash generated
  -> proof submitted
  -> registry marked recoverable
```

The decrypted token is not written back to the registry.

### 7. Recovery queue

After settlement proof is accepted, recoverable state is derived from the commitment registry. TSN creates a recovery job with:

- transfer ID
- epoch
- recoverable amount
- vault source
- recovery reward
- priority score
- job status

### 8. Smart recovery

Smart recovery monitors:

- active liquidity
- pending intent amount
- vault balance
- settlement velocity
- liquidity consumption rate
- configured low-liquidity threshold

Priority increases when liquidity is below threshold or demand is high. Recovery jobs are open work: the first eligible Cranker that completes the job records recovery proof and returns funds to liquidity.

---

## Mempool runtime operations

The TypeScript mempool runtime now exposes these operations:

| Operation | Purpose |
| --- | --- |
| `postIntent` | Creates a TSN intent and registry commitment. |
| `postClaimRequest` | Adds recipient claim/settlement work. |
| `listPendingIntentWork` | Returns intent work for Crankers. |
| `submitIntentVerification` | Marks intent work verified and awards claim points. |
| `acquireClaimLease` | Spends claim points and issues OTDT hash. |
| `postProof` | Accepts settlement proof and marks transfer recoverable. |
| `listCommitmentRegistry` | Shows public registry state. |
| `listClaimPointLedger` | Shows Cranker claim-point accounting. |
| `listClaimLeases` | Shows active/completed leases. |
| `listRecoveryQueue` | Shows recovery jobs. |
| `getLiquidityMetrics` | Shows liquidity and demand metrics. |
| `completeRecoveryJob` | Completes recovery and returns amount to liquidity metrics. |

HTTP server routes mirror those operations:

```text
POST  /intents
GET   /intents
POST  /claim-requests
GET   /claim-requests
GET   /intent-work
GET   /work
GET   /commitment-registry
GET   /claim-points
GET   /claim-leases
GET   /recovery-queue
GET   /liquidity-metrics
POST  /intents/:id/verify
POST  /intents/:id/claim-lease
PATCH /intents/:id/status
PATCH /claim-requests/:id/status
POST  /proofs
POST  /recovery-queue/:id/complete
```

---

## Python Cranker daemon

The Python daemon is designed for operator automation and local runtime validation. It continuously processes queues from the TSN JSON mempool file.

### Responsibilities

1. Load TSN mempool state.
2. Verify pending intents.
3. Award claim points.
4. Acquire claim leases.
5. Generate OTDT hashes.
6. Decrypt settlement tokens in memory.
7. Generate settlement commitment hashes.
8. Mark registry entries recoverable.
9. Enqueue recovery jobs.
10. Complete priority recovery jobs.
11. Update liquidity metrics.

### One-shot execution

```bash
TSN_SETTLEMENT_TOKEN_MASTER_KEY=<32-byte-base64-or-64-char-hex-secret> \
TSN_CRANKER_ONCE=true \
python tsn-cranker-op-daemon/scripts/cranker_daemon.py
```

### Continuous execution

```bash
TSN_SETTLEMENT_TOKEN_MASTER_KEY=<32-byte-base64-or-64-char-hex-secret> \
npm --prefix tsn-cranker-op-daemon run crank:python
```

### Important environment variables

| Variable | Purpose |
| --- | --- |
| `TSN_SETTLEMENT_TOKEN_MASTER_KEY` | Secret used to derive settlement-token encryption/decryption keys. |
| `TSN_CRANKER_DNA` | Cranker DNA authorization input; only its hash is used in envelopes. |
| `TSN_MEMPOOL_FILE` | Local JSON mempool path for the Python scheduler. |
| `TSN_CRANKER_POLL_SECONDS` | Continuous scheduler loop interval. |
| `TSN_LOW_LIQUIDITY_THRESHOLD` | Liquidity threshold used for recovery priority. |
| `TSN_RECOVERY_REWARD_BPS` | Recovery reward basis points used by the TypeScript mempool runtime. |

---

## Security and privacy considerations

### What the update protects

- **Recipient-wallet privacy:** the commitment registry does not store recipient main wallets.
- **Sender-wallet privacy:** registry commitments do not require sender wallet storage.
- **Token secrecy:** decrypted settlement-token contents remain in Cranker memory.
- **Duplicate-claim resistance:** OTDT hash presence blocks repeated claim-lease/decryption attempts.
- **Operator gating:** Crankers need claim points before claim leases.
- **Recovery derivation:** recoverability is derived from accepted settlement proof in the registry.

### What this update does not claim

- It does not make Solana transactions invisible.
- It does not implement live confidential transfer swaps or TF-token swaps.
- It does not place SAS PII on-chain.
- It does not use WhatsApp as a protocol identity; WhatsApp remains a social confidence and notification channel only.

### Operational rules

- Keep `TSN_SETTLEMENT_TOKEN_MASTER_KEY` in secure deployment secrets.
- Rotate Cranker DNA and settlement-token master keys through controlled operations.
- Treat registry entries as public metadata.
- Do not add sender/recipient wallet fields to registry entries.
- Validate SAS attestations at the trust layer without writing sensitive attestation payloads into TSN settlement state.

---

## Testing notes

Recommended checks after changes to this area:

```bash
TSN_SETTLEMENT_TOKEN_MASTER_KEY=<secret> npm --prefix tsn-sdk run build
npm --prefix backend run typecheck
python -m py_compile tsn-cranker-op-daemon/scripts/cranker_daemon.py
```

Recommended runtime smoke path:

1. Create a TSN intent through `JsonFileTsnMempool.postIntent`.
2. Confirm a commitment registry entry exists.
3. Post a claim request.
4. Run intent verification.
5. Acquire a claim lease.
6. Confirm OTDT hash exists in the registry.
7. Submit settlement proof.
8. Confirm registry entry is recoverable.
9. Confirm recovery queue contains a job.
10. Run Python Cranker one-shot.
11. Confirm recovery job completes and liquidity metrics update.

---

## Implementation notes and future hardening

- The current runtime is a local/JSON and HTTP control-plane implementation intended to make TSN behavior executable end-to-end in development and operator environments.
- On-chain program changes should preserve the same privacy boundary: no sender wallet, recipient wallet, decrypted token, phone number, balance, or SAS PII in the commitment registry.
- Production deployments should add durable storage, access control, structured audit logs, and key-rotation ceremonies around settlement-token master keys and Cranker DNA.
- Additional tests should cover duplicate OTDT issuance, mismatched DNA, expired leases, duplicate proof submission, low-liquidity priority scoring, and recovery competition.
