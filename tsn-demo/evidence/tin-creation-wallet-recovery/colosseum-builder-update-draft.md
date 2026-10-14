# Colosseum builder update draft

## Title

Create a ten-digit TIN, then recover it with the owner wallet

## Post

We completed and recorded a full TIN creation and wallet-recovery run in TSN XP on Solana Devnet.

The owner connects a wallet, creates a private ten-digit TIN, and approves the request. After reloading TSN XP, reconnecting the same wallet and approving a recovery message restores the TIN and display name locally. The owner does not need to remember or re-enter the ten digits to recover the identity.

After Receiver ingress, the Node verified the intent and signed its decision. An authorized Cranker then handled the staged Solana submission: all five staging transactions and the final registry transaction finalized on Devnet. The Receiver reached confirmed state, and the owner recovery record was confirmed on-chain. The evidence pack includes the request and verification JSON, finalized transaction evidence, process SVGs with captured values, and the corresponding TSN SDK code. The final Receiver snapshot does not retain the Cranker's transient lease, so the pack proves the finalized work and architecture without presenting a lease record it no longer has.

### Devnet transactions

All six transactions below are recorded as finalized with no error in the captured RPC evidence. The first five are the staged writes; the last creates the TIN registry.

1. Stage 1 · slot 507029392 · [View transaction](https://explorer.solana.com/tx/8ievNF88kHXojJRB6JSdCjxsVffo5B2yXde84aWL7KczpGBCd1zP8NV8GBeKSjK73CXykhVYuAxBwwT1Lcqmza4?cluster=devnet)
2. Stage 2 · slot 507029397 · [View transaction](https://explorer.solana.com/tx/4iCeG2tHmM28qgeUPmr4RQs9dH7DJV7TNarxVkbjApc3cTPMcetLEUhmnHWmxg3B7CvmVCWuQYHLcNNx2hGCPdm6?cluster=devnet)
3. Stage 3 · slot 507029401 · [View transaction](https://explorer.solana.com/tx/41Avibb8GCHFZYWquG28hsVYbuEfdQH6yesjtmjX3M2w7q18C3f9fvVrnaeJvr3ff3PFbRwbrLu5jfytuR4RcuSz?cluster=devnet)
4. Stage 4 · slot 507029405 · [View transaction](https://explorer.solana.com/tx/Kyv3cKHq2sN29vxiEnJrrpJ5EuaVY9EB1fXw3Gnv6R7gmRzv6ZJjCjgeC24RCYmXkM4rn35yf7C7xGcfk6Nxeqd?cluster=devnet)
5. Stage 5 · slot 507029410 · [View transaction](https://explorer.solana.com/tx/455dkr6gUZgArQBgJx6af4yPve9b7j6k3r1DbZ4XtPPwt1YvQ5bRvxskHmfSVVrYzeV8f7edP9snonEtGx3mxQgZ?cluster=devnet)
6. TIN registry creation · slot 507029424 · [View transaction](https://explorer.solana.com/tx/5DqdWoiuW2qHwvLokcN63VVyebGQYU9NfrqcrxEq45mmeKWHnT6AmKANHh5uV4ZbAZnj1k5PHrtSv7H45h4RP8Ys?cluster=devnet)

This makes the TIN useful as a human-readable transfer identity while keeping recovery tied to the owner wallet.

## Media to attach

- Screenshot: choose a frame from the recorded TSN XP recovery result, with the recovered identity visible and wallet/security prompts dismissed.
- Demo video: add the public YouTube URL after the final edit is uploaded.

**YouTube URL:** `ADD_PUBLIC_YOUTUBE_URL_AFTER_UPLOAD`

## Posting check

Replace the YouTube placeholder with the final public or unlisted video URL before publishing. Review the screenshot and video for wallet addresses, TINs, and other identity details that the project owner does not intend to publish.
