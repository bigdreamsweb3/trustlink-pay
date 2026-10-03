# Universal TIN and issuer model

This evidence area tracks TSN's human-readable 10-digit payment identity and the proposed institutional issuer extension. The architecture canvas is [`tin-identity-sdk-flow.svg`](tin-identity-sdk-flow.svg). Reusable playback and rendering tools live in [`../flow-player/`](../flow-player/).

TSN has a confirmed private TIN V1 Devnet creation, including signed Node
verification, staged program execution, final transaction signature, and
registry account. The exact run is summarized in the [completion evidence
guide](../../../docs/protocol-flows/tin-creation/05-evidence.md). The current
local SVG/JSON bundle under [`../tin-creation/`](../tin-creation/) still shows
an earlier verified-only checkpoint and must be refreshed before it is used as
visual evidence of the confirmed run.

Issuer-specific namespaces and bank onboarding remain proposed until implemented and separately demonstrated. Any future transaction canvas must be backed by the exact confirmed Devnet signature, slot, registry address and decoded account, plus matching Receiver, Node, and Cranker evidence. Keep private keys, lookup secrets, and plaintext customer identity out of published canvases.
