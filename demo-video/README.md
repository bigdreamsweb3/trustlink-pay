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

Do not put API keys, wallet secret keys, encrypted environment files, or raw
private payloads in this workspace.
