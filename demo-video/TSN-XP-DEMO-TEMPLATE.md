# TSN XP demo video template

This template breaks the final demo into short cuts that can be recorded independently and assembled later. Record the browser view, the SDK activity rail, and the local service logs as separate sources when possible. Keep wallet addresses, API keys, encrypted payloads, and private route material out of the recording.

## Final edit target

- **Length:** 2:00–3:00 for the public product demo.
- **Product:** TSN XP at the live deployment URL.
- **Network:** Solana Devnet.
- **Story:** a user creates a private TIN identity, prepares a transfer, and the protocol moves the intent through Receiver ingress, Node verification, Cranker settlement, and Solana finality.
- **Evidence rule:** show only observed results. If a step is prepared but not finalized, say that it is prepared.

## Cut 01 — Product identity and network readiness

**Length:** 8–12 seconds.

**Screen action:** Open TSN XP on the Overview screen. Show the TSN XP brand, Solana Devnet indicator, connected service health, and the identity card. Avoid lingering on descriptive text.

**Capture:** The header network state, Receiver and Node health, RPC latency, and the empty or connected identity fields.

**Protocol boundary:** The dApp calls the TSN SDK for network status. It does not decide settlement state itself.

**Voiceover cue:** “This is TSN XP, the user-facing experience for the Transfer Settlement Network. It uses the TSN SDK to check the Devnet services before a transfer begins.”

## Cut 02 — Connect wallet and establish identity context

**Length:** 8–12 seconds.

**Screen action:** Connect Solflare, Phantom, or Backpack. Return to the Overview identity card and show the connected wallet state without reading the full address aloud.

**Capture:** Wallet provider, shortened wallet identity, and account status.

**Protocol boundary:** The wallet supplies the owner authorization context. It does not supply a TIN, phone number, or lookup secret.

**Voiceover cue:** “The wallet provides the owner authorization context. TSN XP keeps identity details in the protocol flow instead of asking the user to expose a wallet address as a payment destination.”

## Cut 03 — Prepare private TIN creation

**Length:** 12–18 seconds.

**Screen action:** Open the Create TIN modal. Enter the display name, connect the wallet if needed, and press the preparation action. Do not claim a TIN exists yet.

**Capture:** The prepared SDK action, the activity entry, and the modal’s accepted or pending state.

**Protocol boundary:** The SDK builds the owner-encryption message and encrypted identity payload. The browser never sends a direct public Node submission.

**Voiceover cue:** “The user prepares a private TIN identity through the SDK. At this point the app has an authorized encrypted payload, not a claimed on-chain TIN.”

## Cut 04 — Receiver ingress

**Length:** 10–15 seconds.

**Screen action:** Show the SDK activity entry for the submitted creation intent. If available, show the Receiver ingress log or captured request record with identifiers redacted.

**Capture:** Request ID or intent ID, route name, timestamp, payload commitment, and Receiver acceptance status. Keep encrypted values and credentials hidden.

**Protocol boundary:** Browser → SDK → Receiver. The Receiver validates the ingress request, stores the durable JSON/Firebase record, and wakes the Node without sending the full payload in the wake signal.

**Voiceover cue:** “The request enters through the Receiver first. The Receiver stores the durable operation and signals the Node that work is available, so user traffic does not overload the verifier.”

## Cut 05 — Node lease and verification

**Length:** 12–18 seconds.

**Screen action:** Show the local Node log while it leases the queued operation. Show the lease ID, operation type, state version, and payload commitment only.

**Capture:** Receiver lease, Node verification result, rejection reason if a negative test is shown, and the fact that the Node is using the local Receiver.

**Protocol boundary:** Receiver → Node. The Node leases work from the Receiver, verifies signatures, canonical payload bytes, route authorization, and replay protection, then returns verification evidence.

**Voiceover cue:** “The Node does not accept a browser submission directly. It leases work from the Receiver, verifies the authorization and exact payload commitment, and returns evidence for the next settlement step.”

## Cut 06 — Cranker authorization and settlement submission

**Length:** 12–18 seconds.

**Screen action:** Show the Cranker process claiming the verified operation. Keep Mother-DNA, signing keys, and private route data out of view.

**Capture:** Claim or lease ID, authorized operation, Cranker state transition, and the Solana submission attempt.

**Protocol boundary:** Node verification → authorized Cranker → Solana program. The Cranker submits the already-authorized operation; it does not create a new user intent or choose a different payout.

**Voiceover cue:** “After verification, an authorized Cranker claims the work and submits the exact operation to Solana. The Cranker transports an approved intent; it does not rewrite the user’s request.”

## Cut 07 — Solana finality and assigned TIN

**Length:** 12–20 seconds.

**Screen action:** Show the finalized transaction signature, program result, assigned ten-digit TIN, and registry resolution if the run completes successfully.

**Capture:** Transaction signature, slot or confirmation state, program instruction, assigned TIN, and the final identity status in TSN XP.

**Protocol boundary:** Solana program finalization is the point at which the TIN can be presented as issued. Earlier SDK, Receiver, or Node states must remain labelled as prepared, accepted, or verified.

**Voiceover cue:** “Only after Solana finalizes the program instruction does TSN XP show the TIN as issued. The transaction signature and registry result provide the proof for this state.”

## Cut 08 — Prepare a private TIN transfer

**Length:** 12–18 seconds.

**Screen action:** Open the TIN transfer modal. Enter the recipient TIN, settlement mint, and amount. Prepare the intent and show the SDK activity result.

**Capture:** TIN route input, token mint, amount, intent ID, and Receiver acceptance. Redact recipient secrets and any encrypted route fields.

**Protocol boundary:** The user addresses the recipient through a TIN route. The SDK builds the transfer intent; the Receiver accepts and stores it before Node verification.

**Voiceover cue:** “A private transfer uses the recipient’s TIN route instead of exposing a wallet address. TSN XP prepares the intent through the SDK, then sends it to Receiver ingress for durable processing.”

## Cut 09 — Wallet transfer and funding boundary

**Length:** 8–12 seconds.

**Screen action:** Briefly show the private wallet transfer and funding panels if they are part of the submitted product scope. Do not spend equal time on every form.

**Capture:** Unsigned transaction or prepared funding result, SDK method name, and current status.

**Protocol boundary:** These panels prepare unsigned or sponsored transactions. They do not claim settlement finality until the Node, Cranker, and Solana evidence exists.

**Voiceover cue:** “TSN XP also exposes wallet transfer and funding preparation through the SDK. These actions remain explicit about whether they are prepared, submitted, or finalized.”

## Cut 10 — Activity rail and audit trail

**Length:** 8–12 seconds.

**Screen action:** Scroll or switch to the SDK activity rail and show the ordered events from network status through finalization.

**Capture:** Timestamp, SDK method, intent ID, Receiver acceptance, Node verification, Cranker submission, and Solana confirmation.

**Protocol boundary:** The activity rail is an operator-facing trace of SDK boundaries. It must not display private keys, API keys, encrypted seeds, or raw private route material.

**Voiceover cue:** “Every boundary is visible in the activity rail: SDK request, Receiver ingress, Node verification, Cranker submission, and final Solana evidence.”

## Cut 11 — Failure and retry safety

**Length:** 8–12 seconds.

**Screen action:** If safe, demonstrate one controlled failure such as an unavailable local RPC or invalid input, then restore service and show the blocked state clearing. Do not use a destructive or financial transaction for this cut.

**Capture:** The error state, clear reason, retry or recovery action, and absence of a false success message.

**Protocol boundary:** TSN XP fails closed when readiness or verification evidence is missing. A prepared intent is not shown as a completed transfer.

**Voiceover cue:** “When a dependency is unavailable or verification fails, the interface shows the blocked state and preserves the boundary. It never turns a prepared request into a completed settlement.”

## Cut 12 — Closing frame

**Length:** 8–10 seconds.

**Screen action:** Return to the Overview identity card with the final issued TIN or the strongest verified state available. Show TSN XP, Solana Devnet, and the final transaction reference briefly.

**Capture:** Final identity status, transaction signature or evidence reference, and the product URL.

**Voiceover cue:** “TSN XP gives users a payment-style experience for identity-based transfers while keeping the Receiver, Node, Cranker, and Solana settlement boundaries verifiable.”

## Recording checklist

- Start local Receiver, Node, and TSN XP with the intended `.env.local` files.
- Confirm the RPC gateway health before recording.
- Capture a fresh request ID and transaction signature for the final run.
- Record browser, Receiver, Node, Cranker, and Solana evidence as separate clips when possible.
- Redact wallet addresses beyond the shortened UI form, API keys, signing keys, encrypted seeds, lookup secrets, and private route payloads.
- Keep each cut under twenty seconds so the final edit can remove failed attempts without re-recording the whole story.
- Name clips with the cut number and date, for example `01-network-ready-2026-09-26.webm`.

## Evidence ledger

| Cut | Required evidence | Captured file | Result | Notes |
|---|---|---|---|---|
| 01 | SDK network status and service health |  |  |  |
| 02 | Wallet connection and identity context |  |  |  |
| 03 | Owner-encryption preparation |  |  |  |
| 04 | Receiver ingress and durable record |  |  |  |
| 05 | Node lease and verification |  |  |  |
| 06 | Cranker claim and Solana submission |  |  |  |
| 07 | Finalized transaction and assigned TIN |  |  |  |
| 08 | TIN transfer intent |  |  |  |
| 09 | Wallet transfer or funding preparation |  |  |  |
| 10 | Activity rail sequence |  |  |  |
| 11 | Controlled failure and recovery |  |  |  |
| 12 | Closing product frame |  |  |  |
