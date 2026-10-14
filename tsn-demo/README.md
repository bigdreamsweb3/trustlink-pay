# TSN XP demo workspace

## Current source recording

[`source/tin-creation-and-wallet-recovery-devnet.webm`](source/tin-creation-and-wallet-recovery-devnet.webm) records the Devnet flow for creating a TIN, reloading TSN XP, reconnecting the owner wallet, and recovering the identity. Its SHA-256 and byte length are recorded in the flow manifest.

## Captured evidence

The matching evidence pack is [`evidence/tin-creation-wallet-recovery/`](evidence/tin-creation-wallet-recovery/). Its Receiver work is `CONFIRMED`; the Node attestation records `VERIFIED`; five staging transactions and the final registry transaction are finalized on Devnet. The final registry account and the owner recovery account are present under the configured TIN program. The recovery envelope is V4 (`TSNTIN04`).

The Receiver receives encrypted identity and recovery data; the TIN registry and owner recovery account hold encrypted records. The plaintext TIN and display name are demonstrated in the recording and are not copied into the evidence JSON. The final Receiver work record has null `nodeLease` and `crankerLease` fields, so the pack does not claim to preserve the transient Cranker lease. Finalized transaction statuses and the signed Node attestation are captured separately; this bundle does not independently retain a Cranker lease or claim record.

Use [`sdk-code-map.md`](evidence/tin-creation-wallet-recovery/sdk-code-map.md) for the exact SDK and XP code paths behind the recording, and [`voiceover-script.md`](evidence/tin-creation-wallet-recovery/voiceover-script.md) for the narration draft and edit beats. The pack also includes the selected Receiver work, Node attestation, health snapshot, process-boundary canvases, staging/final transaction statuses, registry metadata, and recovery-account metadata.

The local Receiver snapshot contains owner-signature and encrypted-envelope values. Keep the evidence pack private and review it before sharing. It excludes wallet private keys and service credentials.

## Evidence collector

`evidence_taker.py` reads the local JSON Receiver store at `tsn-protocol/services/tsn-receiver/.receiver-store.json`; it does not fetch hosted Firebase records. It captures service health, the selected work record and verification fields, filtered Node/Cranker log excerpts when log paths are supplied, and optional Devnet signature and account metadata. It never invents a missing Cranker lease or transaction result.

For a later run, select the Receiver work ID and write into a new evidence folder. Supply the confirmed final signature and registry address for Devnet checks. Review the generated JSON before sharing because Receiver payloads may contain owner signatures and encrypted identity envelopes.

```powershell
python tsn-demo/evidence_taker.py `
  --out tsn-demo/evidence/<flow-name> `
  --receiver-work-id "<receiver-work-id>" `
  --signature "<confirmed-solana-signature>" `
  --registry "<tin-registry-pda>" `
  --rpc "https://tsn-rpc-gateway.vercel.app"
```

## Other folders

- `source/` — original screen recordings;
- `cuts/` — extracted clips for editing;
- `exports/<flow-id>/` — final video for each demo subject, with that video's intermediate renders isolated under `working/`;
- `COLOSSEUM-PITCH-VIDEO-SCRIPT.md` — separate founder presentation script and filming plan;
- `voiceover-studio/` — shared local microphone recorder and audio mastering tool for any demo flow; takes are saved under that flow's `exports/<flow-id>/voiceover/takes/` folder;
- `evidence/flow-catalog.json` — captured and planned flows;
- `evidence/tin-creation/` — earlier TIN creation artifacts, retained as a separate historical pack;
- `evidence/issuer-model/` — evidence notes for the universal TIN and proposed institutional issuer model;
- `evidence_taker.py` — collector for allowlisted local Receiver evidence and Devnet status checks;
- `TSN-XP-DEMO-TEMPLATE.md` — full demo outline and speaking notes;
- `DEMO-SECTION-EVIDENCE.md` — evidence checklist for future demo sections.

The collector reads the local JSON Receiver store and does not fetch hosted Firebase records. A fresh capture should be reviewed against its video and the selected Receiver work before the evidence is presented as one flow.
