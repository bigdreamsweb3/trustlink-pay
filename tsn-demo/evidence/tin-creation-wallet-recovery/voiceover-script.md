# TSN XP: create and recover a TIN

**Voiceover draft, approximately 55 seconds.** Timing is an edit guide; align each beat to the matching moment in the source recording.

| Edit beat | Narration |
| --- | --- |
| Open on TSN XP / connect wallet | “This is TSN XP on Solana Devnet. A Transfer Identity Number gives a person a simple ten-digit identity to share when receiving a transfer.” |
| Show the wallet and Create TIN action | “We connect the owner wallet and create a TIN. The wallet approves the request, while the identity details travel as encrypted data.” |
| Show Receiver, Node, and staged-transaction evidence | “The Receiver accepts the intent. The Node verifies it and signs its decision. The staged registry writes then finalize on Solana.” |
| Show the confirmed result | “For this run, the Receiver reached confirmed state, the Node decision is recorded as verified, and all five staging transactions plus the final registry transaction finalized on Devnet.” |
| Reload, reconnect the same wallet, show recovery approval | “After a reload, the same wallet finds its owner recovery record. One wallet signature lets TSN XP decrypt the TIN and display name locally.” |
| End on the recovered identity and Devnet proof | “The identity is ready again without asking the owner to remember or re-enter the ten digits. The recovery signature authorizes decryption; it does not submit a transaction or move funds.” |

## Edit notes

- Keep the wallet approval readable, but do not show recovery phrases, private keys, or the encrypted master-seed value.
- Pair the verification and finality beat with `receiver-evidence.json` and `solana-staged-transactions.json` as source overlays. All six creation transactions are finalized.
- The final Receiver snapshot does not preserve the transient Cranker lease. Do not add a lease ID or claim a lease was captured in this run.
- Use the SDK call from `sdk-code-map.md` during the recovery beat. The XP currently uses the SDK to fetch the encrypted owner recovery record and performs V4 decryption locally in its browser code.
