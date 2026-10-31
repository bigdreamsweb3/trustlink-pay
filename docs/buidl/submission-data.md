# Dial on Arc — DoraHacks submission data

## A. Submission fields

| Field | Value | Source (file and line, or command) | Verified (yes, no, or how) | What I must do if missing |
|---|---|---|---|---|
| Project name | Dial on Arc | User-provided submission details | Yes, supplied by user | None |
| Short description | Dial on Arc lets you pay a number, not a wallet. A payer enters a 10-digit TIN, and USDC leaves Arc through Circle CCTP V2 toward the TSN reserve on Solana. TSN already creates and resolves TINs live on Solana Devnet through the TSN SDK. Dial adds the Arc deposit side: the Arc Testnet router records the payer, amount and an opaque route commitment, then burns the USDC through CCTP. The demo app uses a labelled stand-in resolver that produces a salted commitment. Real resolution needs TSN's protected lookup secret, so it runs on the TSN side, and the app is not wired to it yet. No real deposit has been sent through this router.<br><br>Arc exposes the payer address and amount, and timing can link activity. The TIN and recipient are never stored onchain. The TSN Node is trusted with the TIN-to-route mapping. What is not built yet is the bridge from Arc to TSN: the CCTP receive on Solana and the credit step. The DIP funds-safety design for that bridge is a specification, not implemented code. | User-provided corrected product description | Yes, copied verbatim | None |
| Repository URL | **[TO FILL: https://github.com/<my-github-username>/dial-on-arc]** | User-provided placeholder instruction | No; placeholder only | Create the Dial repo and replace this marker with its real URL |
| Live app URL | Not provided | User-provided details | No | Publish the Dial app and provide its URL |
| Arc Studio project URL | Not provided | User-provided details | No | Provide the Arc Studio project URL |
| Demo video URL | Not provided | User-provided details | No | Record and provide the demo video URL |
| Builder profile | https://github.com/bigdreamsweb3 and https://x.com/0xbigdream | Existing README.md:280–281 | Public profile links found; builder identity not independently confirmed | Confirm these are the intended DoraHacks builder profiles |
| Dial logo | Not provided | User-provided details | No | Provide the Dial logo asset or URL |

## B. Repository and implementation scope

The current workspace remote is the TrustLink Pay / TSN monorepo, not the Dial submission repository. It does not contain the Dial app files `TSNArcDepositRouter.sol`, `PayPanel.tsx`, or `tsn-tin-pay-mark-v2.svg`. Do not submit the TrustLink Pay remote as Dial's source repository. The repository field above is an explicit placeholder for the Dial repository the user plans to create.

## C. Arc Testnet verification

| Check | Result | Source (file and line, or command) | Verified (yes, no, or how) | What I must do if missing |
|---|---|---|---|---|
| Authoritative Arc Testnet RPC | `https://rpc.testnet.arc.io` | [Arc RPC endpoints](https://docs.arc.io/arc/references/rpc-endpoints.md) | Yes; read-only JSON-RPC checks used this endpoint | None |
| Arc Testnet chain ID | `5042002` (`0x4cef52`) | `eth_chainId` against `https://rpc.testnet.arc.io` | Yes | None |
| Router address | `0x2e4c2fd26403d121bb5d1eb9a1dc6aaa3feda5f1` | User-provided deployment details; `eth_getCode` against official testnet RPC | Address has non-empty code | None for testnet code check |
| Deploy transaction | `0x4c2632c68a37de8ad44a3ec0ed8e1140c2e5ee15221a2d57e792c180982af3df` | User-provided deployment details; `eth_getTransactionReceipt` against official testnet RPC | Receipt found; status `0x1` | None for receipt availability |
| Receipt `to` and `contractAddress` | `to`: `0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789`; `contractAddress`: empty | `eth_getTransactionReceipt` against official testnet RPC | Yes; outer transaction recipient does not equal the router and receipt has no direct `contractAddress` | Do not describe this as a direct contract-creation receipt |
| Router address match in receipt | Router address appears as an emitting log address | `eth_getTransactionReceipt` against official testnet RPC | Yes; router emitted a receipt log, but no inner execution trace was established here | Use an explorer or trace to establish deployment path if required |
| Old `.network` RPC comparison | `https://rpc.testnet.arc.network` returned the same chain ID, non-empty router code, receipt status, `to`, empty `contractAddress`, and router-emitted log | Read-only JSON-RPC calls to both `.io` and `.network` endpoints | Yes; `.io` remains authoritative per Arc documentation and user instruction | None |
| Mainnet chain ID | `5042` (`0x13b2`) | `eth_chainId` against `https://rpc.mainnet.arc.io` | Yes | A mainnet router and transaction still need to be supplied and verified |
| Mainnet router and real deposit | Not provided; user states no real deposit has been sent through the router | User-provided product description | No mainnet deposit evidence | Deploy/verify the intended mainnet router and provide a real transaction only if one is later sent |

## D. Safety and secret-scan note

Read-only checks only; no wallet actions or transactions were performed. A tracked environment-like file exists at `tsn-protocol/services/tsn-node/.env copy`. Its contents were not included here. No secret values are reproduced.

## Gaps in priority order

1. Provide and verify Arc mainnet router and real USDC transaction evidence if/when a real deposit is sent; the supplied state says no real deposit has been sent.
2. Create a public repo named dial-on-arc containing only the Dial files, push it, then replace this placeholder.
3. Publish the Dial app and provide its live URL.
4. Provide the Arc Studio project URL.
5. Record and provide the demo video URL.
6. Provide the Dial logo asset or URL.
7. Confirm the intended public builder profile links for DoraHacks.
