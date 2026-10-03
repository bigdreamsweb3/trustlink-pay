# TSN XP Demo Sections and Evidence

This checklist accompanies the [demo template](TSN-XP-DEMO-TEMPLATE.md). Use
`prepared`, `accepted`, `verified`, `leased`, `submitted`, `confirmed`, and
`decoded` only for stages supported by matching evidence.

## Current TIN creation run

The completed operation is documented in the [TIN V1 completion evidence
guide](../docs/protocol-flows/tin-creation/05-evidence.md). The checked-in
SVG/JSON bundle under `evidence/tin-creation/` still represents an earlier
verified-only checkpoint and has not yet been refreshed from the confirmed
work. Do not present those canvases as evidence of the new transaction until
they are regenerated from its Receiver record.

The current confirmed Receiver work is a private TIN V1 operation. It advanced
through a signed Node verification receipt and Cranker execution using the
program's staged creation path. The final creation signature and registry are
listed in the completion guide. The Node receipt's input commitment matches the
Receiver work commitment. Keep private identity values in the restricted local
diagnostic bundle; public cuts should show only sanitized state transitions,
receipt validation, transaction reference, and registry result.

## Cut-by-cut capture plan

| Cut | Evidence to show | Current status | Next capture |
| --- | --- | --- | --- |
| 01 — Product and network readiness | TSN XP overview, Devnet indicator, SDK health for Node, Receiver, configured RPC | Existing health snapshot is historical | Record the Overview immediately before the demo. |
| 02 — Wallet context | Wallet provider, masked owner, identity card | Prior recording shows a connected wallet | Connect the demo wallet and keep the full address out of narration. |
| 03 — Create TIN intent | SDK action, owner-encryption approval, owner intent approval | A real TIN V1 creation completed | Record the current UI flow and wallet approvals. |
| 04 — Receiver ingress | Receiver work ID, `RECEIVED`, payload commitment | Completed; earlier stage artwork is from a previous work item | Refresh evidence from the confirmed work; do not fabricate an ingress snapshot. |
| 05 — Node verification | Node lease, verification type, signed decision receipt | Completed; receipt is present and bound to the input commitment | Record a fresh Node log with private values redacted. |
| 06 — Cranker lease | Cranker identity, lease state, receipt validation | Completed as part of the staged TIN operation | Capture the Cranker claim and Receiver transition from a refreshed bundle. |
| 07 — Solana finality | Staging path, finalization signature, registry validation | Completed; staged transaction signatures and final signature are available | Verify the final transaction and account before recording. |
| 08 — Private TIN transfer | Recipient resolution, mint, amount, SDK intent, Receiver result | Not captured | Include only after running and verifying a real transfer. |
| 09 — Wallet transfer and funding | SDK method, prepared transaction, settlement result | Not captured | Include only if in demo scope and backed by a real run. |
| 10 — SDK activity rail | Ordered SDK actions and lifecycle milestones | User-provided activity exists, but no saved current screen capture | Record a fresh activity rail through finalization. |
| 11 — Failure and recovery | Real blocked state, cause, recovery, successful retry | A local Receiver challenge/storage issue was fixed during development | Optional engineering cut; show logs only after redaction. |
| 12 — Closing state | Identity card and strongest confirmed state | Protocol work is `CONFIRMED`; the XP currently shows the new TIN in the issuing session | Keep that session open for the identity-card shot; reconnect recovery is not implemented. |

## Data display rules

- Show the work ID, abbreviated commitment, Node receipt validation, Cranker
  state, final transaction signature, and registry address as protocol evidence.
- Treat full Receiver JSON and generated SVG/JSON evidence as private
  diagnostics. They can contain owner signatures, encrypted envelopes, nonces,
  and route commitments. Publish sanitized lifecycle summaries instead.
- Keep wallet private keys, API credentials, signing keys, lookup secrets,
  plaintext TIN values, and raw private route material out of public cuts.
- Do not display a TIN as issued until the Receiver reports `CONFIRMED` and the
  finalized Devnet registry account has been independently verified.

## Refreshing the evidence bundle

Refresh `evidence/tin-creation/` from the local Receiver JSON store with:

```powershell
python tsn-demo/evidence_taker.py
```

The collector selects the newest TIN operation unless
`--receiver-work-id "<receiver-work-id>"` is supplied. Review all generated
files before sharing. The local collector does not fetch hosted Firebase
records and does not invent missing stage evidence. Supply `--signature` and
`--registry` only with observed values, then independently verify the final
signature and account on Devnet.
