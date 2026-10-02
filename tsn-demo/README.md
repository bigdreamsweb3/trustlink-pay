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

The September 25 recording predates the Receiver-first path. The last captured
local run is in [the TIN creation evidence bundle](evidence/tin-creation/) and
shows Receiver ingress followed by Node verification. That captured record was
`VERIFIED`, with no Cranker lease or transaction signature. It remains a
historical checkpoint and is not the current completed run.

The current local Receiver store now contains a separate confirmed TIN V1
operation. It used staged Solana creation and includes the Node verification
attestation, staging transaction signatures, final signature, and registry
address. The current proof is recorded in
[the TIN V1 completion evidence guide](../docs/protocol-flows/tin-creation/05-evidence.md).
The SVG/JSON bundle has not yet been refreshed from that confirmed work, so do
not present its earlier canvases as the same transaction until it is recaptured.
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
Node processing. Treat these earlier checkpoints as local diagnostic artifacts;
they may contain owner signatures, encrypted envelopes, and identity-bound
commitments. Keep them private, inspect them before sharing, and refresh them
from the confirmed work before using the canvases as evidence of the completed
run.

## Folders

- `source/` — original screen recordings;
- `cuts/` — extracted clips for editing;
- `exports/` — final demo renders;
- `evidence/tin-creation/` — the refreshed evidence pack for the TIN creation flow.
- `evidence/flow-catalog.json` — implemented and planned demo flows; planned
  flows do not get empty or fabricated evidence folders.
- `evidence/flow-player/` — reusable SVG flow player, six-node marker, configs,
  and local WebM render helper.
- `evidence/issuer-model/` — evidence notes for the universal TIN and proposed
  institutional issuer model.
- `COLOSSEUM-ISSUER-NETWORK-BUILDER-UPDATE.md` — draft announcement and video
  outline for the issuer-model direction.

## Evidence capture

Use `python evidence_taker.py` from this folder or the repository root to
refresh `evidence/tin-creation/` in place. With no `--receiver-work-id`, it
selects the newest TIN operation from the local Receiver store and does not
create a date-stamped run folder. It records SDK/Receiver/Node health, an RPC
JSON-RPC `getHealth` result, selected TIN work and verification fields,
filtered Node and Cranker log events, and
optional Devnet signature/registry account metadata. Raw Solana account bytes,
arbitrary database fields, wallet private keys, and service credentials are
excluded. The local diagnostic bundle can still contain owner signatures,
encrypted envelopes, and identity-bound values, so it is not a public release
artifact. The local JSON adapter must be enabled for Receiver records to be
read from disk; hosted Firebase records are not fetched by this local tool.

For local evidence, `--store` defaults to
`tsn-protocol/services/tsn-receiver/.receiver-store.json`. The collector
selects the newest `TIN_OPERATION` record unless `--receiver-work-id` is
supplied. Its explicit field selection supports local boundary comparison, but
owner signatures, nonces, encrypted master-seed envelopes, and route
commitments remain sensitive protocol data. Keep the generated JSON and SVG
files in the private project workspace and publish a sanitized summary instead
of copying these values into a builder update or public demo.

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
