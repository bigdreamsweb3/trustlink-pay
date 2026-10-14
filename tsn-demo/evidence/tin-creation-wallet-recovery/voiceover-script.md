# Demo 1 · Create and recover a TIN

Use each line as a short voice cue, not a paragraph to read. Record one section at a time and leave a natural pause after each cue so you can add your own explanation before moving to the next scene.

| Video time | Scene | Voice cue |
| --- | --- | --- |
| 00:00–00:10 | TSN XP and wallet connection | “This is TSN XP on Solana Devnet. A TIN is a ten-digit ID people can share to receive transfers.” |
| 00:10–00:23 | Create TIN and wallet approval | “I connect my wallet, add a display name, and approve creation. TSN encrypts the identity on this device before the signed request is sent.” |
| 00:23–00:29 | Receiver ingress | “The Receiver accepts the encrypted request.” |
| 00:28–00:33 | Node verification | “The Node verifies it and signs its decision.” |
| 00:33–00:40 | Cranker submission | “A Cranker takes the verified work and stages the registry update.” |
| 00:39–00:46 | Solana finality | “Five staged writes and the final registry write confirm on Devnet. The program assigns the TIN.” |
| 00:46–00:54 | Wallet recovery | “After reload, I reconnect the same wallet and approve recovery. TSN XP decrypts my TIN and name on this device. Recovery sends no transaction.” |

## Delivery notes

- Keep each cue conversational and pause between scenes. Add personal details only where they match the on-screen action.
- For the creation scene, say that encryption happens on the user's device before the request is sent. Do not claim that an attacker can never access the device; local encryption protects the identity data from being sent in plaintext, but cannot make a compromised device safe.
- Keep the owner's signature and encrypted identity bytes out of overlays. The saved Receiver snapshot does not preserve the transient Cranker lease, so describe the Cranker's submission role without claiming a lease ID was captured.
