# Colosseum Week 2 update video

**Submission:** Week 2 progress update for project 14660
**Target length:** 45–60 seconds
**Visibility:** Private to the team, judges, and Colosseum
**Due:** September 28 at 8:00 AM PDT

## Edit sequence

### 0:00–0:08 — TSN XP product frame

Show the TSN XP Overview screen on Solana Devnet with the network health indicators.

**Voiceover:** “This week we moved the public product from the earlier TrustLink Pay surface into TSN XP, the identity and transfer experience for the Transfer Settlement Network.”

### 0:08–0:20 — Real SDK flow

Show wallet connection, the identity card, and the Create TIN modal preparing an owner-authorized request.

**Voiceover:** “The dApp now uses the real TSN SDK for wallet context, private TIN preparation, transfer intents, and network readiness checks.”

### 0:20–0:35 — Receiver-first architecture

Show the Receiver ingress result followed by local Receiver and Node logs. Keep IDs shortened and redact credentials and encrypted payloads.

**Voiceover:** “The request enters through the Receiver first. The Receiver stores the durable operation and wakes the Node, while the Node leases and verifies the queued work instead of accepting direct browser submissions.”

### 0:35–0:48 — Cranker and settlement evidence

Show the Cranker claim or verification evidence and, if available, the finalized Solana transaction reference.

**Voiceover:** “The next step is an authorized Cranker submission and Solana finality. We are capturing each boundary so the final demo proves the actual path rather than showing mock data.”

### 0:48–1:00 — Next milestone

Return to TSN XP with the activity rail visible.

**Voiceover:** “Our next milestone is the complete recorded Devnet run: Receiver ingress, Node verification, Cranker settlement, assigned TIN, and the finalized transaction signature.”

## Required clips

- TSN XP Overview with network status.
- Wallet connection and Create TIN preparation.
- Receiver ingress evidence.
- Node lease and verification evidence.
- Cranker or Solana finality evidence when available.
- Activity rail showing the ordered SDK actions.

Do not upload this update until the one-minute cut contains observed evidence. Do not include API keys, signing keys, encrypted seeds, lookup secrets, or raw private route payloads.
