# TSN XP demonstration workspace

## Source

`source/tin-creation-intent-2026-09-25.webm` captures the real protocol UI
flow recorded on 2026-09-25.

The recording shows:

- Solflare connected to wallet `9V7qYg…rTpR`;
- display name `Daniel TrustLINK LABS`;
- SDK owner-encryption and owner-intent flow completed;
- live RPC selected at `https://tsn-rpc-gateway.vercel.app`;
- Node acceptance with intent ID `4a50c688-14e1-4abb-bbf7-31cbc010d8ca`.

The local recording path is **Browser → SDK → local TSN Receiver JSON store →
local TSN Node → Receiver**. The Receiver owns the durable work record. The Node
leases that record through the Receiver API, verifies it, and reports the
decision back; it does not keep a separate durable TIN work record or connect
directly to the database. The Node uses the Receiver's internal state API for
its nonce replay guard. In local mode, the Receiver persists to
`.receiver-store.json`; the live Receiver uses Firebase.

## Evidence status

The September 25 recording predates the Receiver-first path. The newer local run
is captured in [the TIN creation evidence bundle](evidence/tin-creation/) and shows
Receiver ingress followed by Node verification. The record is
`VERIFIED`; it has no Cranker lease, transaction signature, or assigned TIN yet.
Use [the section evidence plan](DEMO-SECTION-EVIDENCE.md) to record the remaining
cuts without presenting pending stages as completed.

`evidence/tin-creation/manifest.json` maps the source recording at
`tsn-demo/source/tin-creation-intent-2026-09-25.webm` and records its SHA-256
and byte length. It also names the local Receiver store used for the current
JSON snapshot. The source recording is a context reference; compare its intent
ID before presenting it as the same transaction as the selected Receiver work.

The evidence bundle contains scalable 16:9 SVG canvases in `sections/` for the
12 demo cuts, four ordered Node and Cranker checkpoints in
`tin-creation-stages/`, and six process-boundary canvases in `processes/`.
`receiver-evidence.json`, the stage JSON, and `process-boundaries.json` hold the
complete allowlisted TIN request, owner signature, encrypted seed envelope,
verification payload, a decoded inspection of the seed-envelope JSON wrapper,
and the data needed at each service boundary. The original base64 value is
preserved alongside that decoded view. Long SVG JSON continues into adjacent
code cards in the same canvas, with line ranges marking the continuation; the
paired JSON files retain the complete captured values. The pre-Node record is explicitly marked as reconstructed
from retained Receiver ingress because no separate snapshot was saved before
Node processing. Cranker claim, Solana submission, and the Receiver result
remain `NOT_CAPTURED` until observed in a real run.

## Folders

- `source/` — original screen recordings;
- `cuts/` — extracted clips for editing;
- `exports/` — final demo renders;
- `evidence/tin-creation/` — the refreshed evidence pack for the TIN creation flow.
- `evidence/flow-catalog.json` — implemented and planned demo flows; planned
  flows do not get empty or fabricated evidence folders.

## Evidence capture

Use `python evidence_taker.py` from this folder or the repository root to
refresh `evidence/tin-creation/` in place. With no `--receiver-work-id`, it
selects the newest TIN operation from the local Receiver store and does not
create a date-stamped run folder. It records SDK/Receiver/Node health, an RPC
JSON-RPC `getHealth` result, the complete explicit allowlist of TIN work and
verification fields, filtered/redacted Node and Cranker log events, and
optional Devnet signature/registry account metadata. Raw Solana account bytes,
arbitrary database fields, wallet private keys, and service credentials are
excluded. The local JSON adapter must be enabled for Receiver records to be
read from disk; hosted Firebase records are not fetched by this local tool.

For local evidence, `--store` defaults to
`tsn-protocol/services/tsn-receiver/.receiver-store.json`. The collector
selects the newest `TIN_OPERATION` record unless `--receiver-work-id` is
supplied. It copies the allowlisted protocol request and verification fields,
including the public owner key, owner signature, owner intent message, nonce,
expiry, encrypted master-seed envelope, route values, and hashes. These are
the authorization and encrypted payload values needed to compare boundaries.
It excludes wallet private keys, service credentials, and fields outside the
protocol allowlist.

Example:

```powershell
python tsn-demo/evidence_taker.py `
  --signature "<confirmed-solana-signature>" `
  --registry "<tin-registry-pda>" `
  --node-log "evidence/node.log" `
  --cranker-log "evidence/cranker.log" `
  --watch 30
```

Review the generated bundle before sharing it. Public transaction signatures,
registry addresses, and an assigned TIN are included when actually present in
the captured Receiver result or supplied for an RPC check. The collector does
not invent missing Cranker or Solana evidence.

Use `--receiver-work-id "<receiver-work-id>"` only when pinning the collector
to a particular TIN operation instead of selecting the newest one. The older
`--intent-id` spelling remains an alias for this Receiver work ID filter.

Do not put API keys, wallet secret keys, encrypted environment files, or raw
private payloads in this workspace.
