# TSN XP demo sections and evidence

This is the capture checklist for the 12 cuts in
[TSN-XP-DEMO-TEMPLATE.md](TSN-XP-DEMO-TEMPLATE.md). It records what the current
local run proves and what still needs a real capture. Use the evidence labels
`prepared`, `accepted`, `verified`, `leased`, `submitted`, `confirmed`, and
`decoded` only at the corresponding boundary.

## Current TIN creation run

The selected TIN operation is in
[evidence/tin-creation](evidence/tin-creation/), refreshed from the local
Receiver JSON store without creating a dated folder.

For editors, the bundle has `sections/01-*.svg` through `sections/12-*.svg`,
four chronological checkpoints under `tin-creation-stages/`, six service
boundary canvases under `processes/`, and complete machine-readable JSON in
`receiver-evidence.json`, the stage files, and `process-boundaries.json`. The
SVGs are responsive canvases with readable JSON excerpts; the paired JSON
preserves each complete allowlisted request/verification payload. The
longer SVG excerpts continue into adjacent code cards in the same image, with
line ranges marking where the JSON continues. The flow catalog at
`evidence/flow-catalog.json` lists
this implemented TIN creation flow and the planned transfer/funding flows; it
does not create empty evidence for flows that have not been captured. The
`01-before-node` checkpoint is reconstructed from the retained Receiver
ingress because no separate snapshot was saved before Node processing.

| Evidence item | Observed value |
| --- | --- |
| Operation | `TIN_OPERATION`, `tin_creation`, program-assigned |
| Receiver work ID | `9eda4387-bd52-40da-9313-2c71bd175bb7` |
| Owner intent ID | `321a1c34-0772-4fca-beab-d4de4c1be112` |
| Owner intent hash | `8466640de2dd87fd5643b981085e4dd4a4f2d1e6affe9be8aeca06b99171630d` |
| Receiver payload commitment | `b1a68b7c3b3f8826da6c835f6bdda6f112ecdf7bc0adff4adaa4b78c80c8b031` |
| Owner wallet | Full public key is included in the selected JSON excerpt |
| Display name | Present in the TIN intent payload |
| Owner signature | Present, 64 decoded bytes; full base64 value is in allowlisted JSON |
| Encrypted master seed | Present, 948 decoded bytes; full encrypted envelope is in allowlisted JSON |
| Receiver state | `VERIFIED`, state version `3` |
| Node lease evidence | Receiver work ID above, state version `2`, same payload commitment |
| Cranker lease | None recorded |
| Solana result | None recorded; no transaction signature or assigned TIN yet |

The operation advanced through `RECEIVED` (state version 1),
`NODE_VERIFYING` (state version 2), and `VERIFIED` (state version 3). The
Receiver retains the current durable record. The Node has no direct database
connection and does not keep its own durable TIN work record: it leases through
the Receiver API, validates the payload, and returns its decision to the
Receiver. The Node also uses the Receiver's internal state API for its atomic
nonce replay guard, so the Receiver remains the persistence boundary.

## Cut-by-cut capture plan

| Cut | Evidence to show | Current evidence and status | Next capture |
| --- | --- | --- | --- |
| 01 — Product and network readiness | TSN XP overview, Devnet indicator, SDK health for Node, Receiver, and RPC | The current snapshot is in `evidence/tin-creation/health.json`; capture a fresh header view immediately before recording. | Record the Overview with local Node and Receiver selected and SDK RPC `getHealth` ready. |
| 02 — Wallet context | Wallet provider, masked owner address, identity-card state | Existing September 25 source clip shows Solflare and a connected wallet. The current run uses the masked address above. | Reconnect the intended demo wallet and keep the full address out of the narration. |
| 03 — Create TIN intent | SDK request body, owner-encryption envelope, owner-intent signature, intent hash | Complete allowlisted ingress body is in `receiver-evidence.json` and `process-boundaries.json`; the SVG shows a readable excerpt. | Record the wallet approval and SDK submitted state in a fresh UI capture. Do not call it an issued TIN. |
| 04 — Receiver ingress | Receiver endpoint, work ID, accepted state, payload commitment, receive time | The current record retains state version 3. The original state-version-1 ingress snapshot was not separately persisted, so the stage file marks it reconstructed from the accepted payload and transition history. | Capture the Receiver `RECEIVED` response or local log before Node verification in the next run. |
| 05 — Node verification | Local Node lease, `TSN_TIN_OPERATION` verification type, decision returned to Receiver | Verified. Receiver lease metadata identifies the work and state version 2; final Receiver state is version 3. | Record the Node terminal's local Receiver URL, lease, and `VERIFIED` transition. Never expose API credentials. |
| 06 — Cranker lease | Authorized Cranker identity, work ID, `CRANKER_LEASED` state | Pending. The current record has `crankerLease: null`. | Capture the Cranker claim and Receiver state after the Cranker actually leases this work. |
| 07 — Solana finality and assigned TIN | Submission signature, confirmation, slot, registry account, assigned TIN | Pending. The current record has `result: null`; no on-chain TIN is evidenced. | Capture the signature, Devnet confirmation, decoded registry account, and assigned TIN only after finalization. |
| 08 — Private TIN transfer | Recipient TIN resolution, token mint, amount, SDK intent, Receiver result | No transfer evidence captured. | Record only after a finalized TIN is available and the transfer path is actually run. |
| 09 — Wallet transfer and funding | SDK method, unsigned/sponsored transaction state, settlement result if run | No wallet-transfer or funding evidence captured. | Include this cut only if these flows are in the submitted demo scope. |
| 10 — SDK activity rail | Timestamped SDK actions and lifecycle milestones | User-provided activity shows `SDK createTin` with the owner intent hash and Receiver acceptance. The full raw UI log has not been saved as an artifact. | Capture the rail with the Receiver work ID, Node verification, Cranker lease, and Solana result as they occur. |
| 11 — Failure and recovery | A real blocked state, cause, fix, and recovered status | Internal diagnostic: the first local Receiver lease returned HTTP 500 because local query snapshots lacked document refs; after the fix, the same work verified. | Keep this as an optional engineering cut; use only if the short demo has room. |
| 12 — Closing state | Identity card and strongest confirmed state | Current strongest state is `VERIFIED`, not issued. | Close on the finalized TIN and transaction reference after Cut 07 completes; otherwise label it as verified and pending. |

## Data display rules

- Show the Receiver work ID, payload commitment, owner-intent hash, state, and
  timestamps as protocol evidence.
- Show complete public keys and protocol hashes when comparing canvases with
  Receiver JSON. The machine-readable evidence includes the full owner
  signature and encrypted seed envelope needed to verify each handoff; keep
  their meaning clear as authorization and ciphertext, not wallet secrets.
- Keep wallet private keys, API credentials, signing keys, and environment
  secrets out of the evidence bundle.
- The Cranker needs the owner public key and signature to construct the
  owner-authorized instruction. Those are public authorization data, not the
  wallet's private key. The Cranker response omits the unused
  `ownerIntentMessage`.
- Do not display `TIN issued`, a transaction signature, or final identity
  status until the Receiver reports the Cranker result and the Devnet account
  has been independently checked.

## Refreshing the evidence bundle

Refresh the same evidence folder after each stage with:

```powershell
python tsn-demo/evidence_taker.py
```

The collector selects the newest TIN operation automatically. Pass
`--receiver-work-id "<receiver-work-id>"` to pin it to a specific operation.
The manifest records the Receiver work ID and owner intent ID separately.

For the final run, add `--signature` and `--registry` only after a Cranker
submission supplies those actual values. The collector checks Devnet
confirmation for a supplied signature and never invents a transaction result.
