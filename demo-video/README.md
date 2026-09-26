# TrustLink demo video workspace

## Source

`source/tin-creation-intent-2026-09-25.webm` captures the real protocol UI
flow recorded on 2026-09-25.

The recording shows:

- Solflare connected to wallet `9V7qYgC8wiUoPB6bZuE7Py9t3jywJXcxhihk15MGrTpR`;
- display name `Daniel TrustLINK LABS`;
- SDK owner-encryption and owner-intent flow completed;
- live RPC selected at `https://tsn-rpc-gateway.vercel.app`;
- Node acceptance with intent ID `4a50c688-14e1-4abb-bbf7-31cbc010d8ca`.

The target architecture is **Browser → live TSN Receiver/Firebase ingress**.
The Receiver durably stores the operation first and wakes the local TSN Node
with a payload-free notification. The Node then leases and verifies the queued
operation.

## Evidence status

This recording predates the Receiver-first change: it shows a real intent
accepted by the local Node. After the change, the next recording should show
Receiver ingress first, then Node lease/verification. It is not yet evidence of
a finalized TIN. The next recording should capture Receiver verification,
Cranker lease, Solana submission, registry PDA, assigned TIN, and finalized
transaction signature.

## Folders

- `source/` — original screen recordings;
- `cuts/` — extracted clips for editing;
- `exports/` — final demo renders.

## Evidence capture

Use `python evidence_taker.py` from this folder or the repository root to make
a timestamped evidence bundle. It records SDK/Receiver/Node/RPC health,
allowlisted Receiver work fields, filtered/redacted Node and Cranker log
events, and optional Devnet signature/registry account metadata. It does not
copy raw Receiver payloads or raw Solana account data. The local JSON adapter
must be enabled for Receiver records to be read from disk; hosted Firebase
records are not fetched by this local tool.

Example:

```powershell
python demo-video/evidence_taker.py `
  --intent-id "<receiver-work-id>" `
  --signature "<confirmed-solana-signature>" `
  --registry "<tin-registry-pda>" `
  --node-log "evidence/node.log" `
  --cranker-log "evidence/cranker.log" `
  --watch 30
```

Review the generated bundle before sharing it. Public transaction signatures
and registry addresses are included when supplied; TIN values are masked.

Do not put API keys, wallet secret keys, encrypted environment files, or raw
private payloads in this workspace.
