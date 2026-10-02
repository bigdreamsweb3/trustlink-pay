# Universal TIN and issuer model

This evidence area tracks TSN's human-readable 10-digit payment identity and the proposed institutional issuer extension. The architecture canvas is [`tin-identity-sdk-flow.svg`](tin-identity-sdk-flow.svg). Reusable playback and rendering tools live in [`../flow-player/`](../flow-player/).

TSN has prior verified on-chain TIN activity. The latest TIN V1 changes refine the issuance architecture; the concept diagram is not itself a transaction receipt. The current local TIN creation bundle is at [`../tin-creation/`](../tin-creation/). Its selected Receiver operation is `VERIFIED` but has no Cranker lease or signature, so that specific operation does not prove finality.

Issuer-specific namespaces and bank onboarding remain proposed until implemented and separately demonstrated. Any future transaction canvas must be backed by the exact confirmed Devnet signature, slot, registry address and decoded account, plus matching Receiver, Node, and Cranker evidence. Keep private keys, lookup secrets, and plaintext customer identity out of published canvases.
