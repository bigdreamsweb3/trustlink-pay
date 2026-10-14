# AI video maker brief: TSN XP TIN creation and recovery

Create a polished 16:9 product demo from the TSN XP screen recording and evidence pack in this folder. Make it feel like a concise Solana developer product update: technically precise, visually restrained, and understandable to non-developers.

## Deliverables

- A 60–90 second 1920×1080 MP4 with H.264 video and AAC audio.
- A clean render without narration, plus an editable project/timeline with the recording and SVG overlays linked.
- Keep the original screen recording unchanged. Use `voiceover-script.md` as narration and timing guidance; do not invent narration or states.

## Source material

- XP recording: `record-xp-demo-rec/tin-creation-and-wallet-recovery-devnet.webm`
- Process canvases: `processes/01-sdk-to-receiver.svg` through `processes/07-wallet-recovery-sdk.svg`
- JSON evidence: `process-boundaries.json`, `receiver-evidence.json`, `solana-staged-transactions.json`, `solana-registry.json`, `solana-signature.json`, `wallet-recovery-evidence.json`, and `onchain-recovery-record.json`
- Narration and code map: `voiceover-script.md` and `sdk-code-map.md`

## Edit sequence

1. Introduce TSN XP on Solana Devnet and explain that a TIN is a human-readable ten-digit transfer identity.
2. Show wallet connection, display-name entry, owner approval, and TIN creation from the actual recording.
3. Overlay the SDK ingress canvas and `submitTinV1Creation` code, then show the Node verification canvas with its signed decision.
4. Explain the Cranker’s role accurately: it receives authorized verified work and submits staged registry instructions to Solana. Use the Receiver-to-Cranker and Cranker-to-Solana canvases. State that all five staging transactions and the final registry transaction finalized on Devnet.
5. Return to the recording for reload, reconnection, wallet recovery approval, and the recovered identity. Show `07-wallet-recovery-sdk.svg` with `recoverTinV1IdentityForOwner`.
6. Close on the recovered identity and Devnet evidence. Keep the ending factual.

## Visual direction

- Keep TSN’s dark green, ivory, and restrained gold palette from the SVGs.
- Preserve real JSON field names and captured values. Never substitute mock data or file-path callouts.
- Make SVG/code inserts readable at 1080p. Pan or cut through dense JSON instead of shrinking it beyond readability.
- Let the XP recording remain visually dominant; use process canvases as brief, purposeful cutaways.
- Use restrained interface sounds only for transitions. Keep wallet prompts and signature messages clear.

## Accuracy and privacy

- Do not fabricate wallet approval, Node decisions, Cranker activity, signatures, TINs, or Solana finality.
- The final Receiver snapshot does not retain the transient Cranker lease. Explain that as a retention limit; do not imply that no Cranker processed the work, and do not invent a lease identifier.
- Do not show seed phrases, private keys, or raw Receiver store files. Do not decode ciphertext as plaintext.
- Review the recovered TIN, display name, wallet address, and signatures before publishing; include identity details only if the project owner intends them to be public.
- Recovery uses an owner wallet signature to decrypt locally. Do not describe recovery as a transaction or fund movement.
