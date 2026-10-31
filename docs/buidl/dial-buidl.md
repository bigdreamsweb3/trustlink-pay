# Dial on Arc

## 1. Project name and tagline

**Project:** Dial on Arc

**Tagline options**

1. Pay a number, not a wallet.
2. Send USDC using a private identifier.
3. Connect an Arc payment to a TSN route.

**Pick:** Pay a number, not a wallet.

## 2. Summary

Dial on Arc explores identifier-addressed USDC payments: a payer enters a 10-digit TIN instead of a recipient wallet. The Arc router records a payer, amount and opaque route commitment, then calls Circle CCTP V2 to burn USDC toward a Solana reserve. The existing TSN system on Solana Devnet is intended to match that commitment and credit a private balance, but the Solana mint and TCAP credit are not built or tested in this project. The strongest verifiable result today is the Arc Testnet router at [0x2e4c2fd26403d121bb5d1eb9a1dc6aaa3feda5f1](https://explorer.testnet.arc.io/address/0x2e4c2fd26403d121bb5d1eb9a1dc6aaa3feda5f1), with deploy transaction [0x4c2632c68a37de8ad44a3ec0ed8e1140c2e5ee15221a2d57e792c180982af3df](https://explorer.testnet.arc.io/tx/0x4c2632c68a37de8ad44a3ec0ed8e1140c2e5ee15221a2d57e792c180982af3df). No real USDC has moved through the router yet.

## 3. Proof table

| Item | Value | Link |
|---|---|---|
| Arc mainnet router | [TO FILL: Arc mainnet router address] | [TO FILL: Arc mainnet router explorer address link] |
| Mainnet transaction | [TO FILL: real USDC transaction hash] | [TO FILL: explorer.arc.io transaction link] |
| Amount | [TO FILL: amount of USDC in the verified mainnet transaction] | [TO FILL: mainnet transaction link] |
| Solana mainnet receipt | [TO FILL: Solana mainnet receipt transaction hash] | [TO FILL: Solana explorer transaction link] |
| Arc Studio project | [TO FILL: public Arc Studio project URL] | [TO FILL: public Arc Studio project URL] |
| GitHub repo | [TO FILL: public repository URL] | [TO FILL: public repository URL] |
| Live app | [TO FILL: public live app URL] | [TO FILL: public live app URL] |
| Demo video | [TO FILL: public demo video URL] | [TO FILL: public demo video URL] |
| Builder profile | [TO FILL: public builder profile URL] | [TO FILL: public builder profile URL] |
| Arc Testnet router | 0x2e4c2fd26403d121bb5d1eb9a1dc6aaa3feda5f1 | [Router](https://explorer.testnet.arc.io/address/0x2e4c2fd26403d121bb5d1eb9a1dc6aaa3feda5f1), [deploy transaction](https://explorer.testnet.arc.io/tx/0x4c2632c68a37de8ad44a3ec0ed8e1140c2e5ee15221a2d57e792c180982af3df) |

## 4. The problem

Paying someone on a public chain usually requires their wallet address, and that payment links the payer and recipient wallets. Someone who knows a person by an identifier cannot use that identifier directly to pay them without first obtaining a wallet address.

## 5. What Dial does

1. **Resolve:** The payer enters a TIN. A demo resolver turns it into a salted, opaque `routeCommitment`. The TIN is not shown again and is not sent onchain. The resolver is a labelled stand-in; the TSN Node resolve endpoint does not exist yet.
2. **Deposit:** The payer approves USDC and calls `deposit` on the Arc router with the commitment, amount and expiry.
3. **CCTP burn:** In the same transaction, the router calls Circle CCTP V2 to burn USDC for the TSN reserve on Solana, using Solana CCTP domain 5.
4. **Reserve mint:** Circle attestation is part of the planned bridge flow; the testnet router has not sent a real deposit, and this receipt path is not demonstrated by this project. The TSN reserve is on Solana Devnet.
5. **Credit:** The existing TSN Node is intended to match the commitment to a live route and credit a recipient private balance. This mint and credit are not built or tested in this project.

## 6. What we built in Arc Studio

Arc Studio produced the `TSNArcDepositRouter` contract, its tests and review, the Arc Testnet deployment, and the responsive Dial web app. The contract uses Circle CCTP V2's seven-argument `depositForBurn` call. The original reviewer specification used the old four-argument call, which does not match the built contract.

The router records an intent whose event includes the payer address. It stores no TIN, recipient or destination address. The project has 66 Foundry tests against mocks, including fuzz and invariant tests. A security review found that ownership could be renounced while paused, which could freeze deposits; that issue was fixed. The app has Pay, Receipts, Privacy and Protocol tabs. Receipts includes a JSON handoff for the TSN Node. The app is responsive on phones and desktops and connects wallets through wagmi and ConnectKit.

## 7. What stayed private and what did not

Arc stores a payer, an amount and a salted commitment, not the TIN or recipient. The salt makes the commitment difficult to guess from the 10 billion possible 10-digit TINs. The only link between a payment and a recipient is held offchain by the TSN Node, which is trusted with the TIN. The identity leg is bound by that Node; the money leg is designed to be backed by Circle's CCTP attestation.

The payer address and amount are public on Arc. Amount remains visible across the flow, and timing can link a deposit to a credit. The app's “What Arc saw / What stayed private” view is built from a real onchain event. The encrypted receipt envelope described in the DIP document is not built.

## 8. How USDC moves

```text
Payer
  -- USDC deposit --> Arc router [deployed on Arc Testnet; no real deposit sent]
  -- CCTP V2 burn --> Circle CCTP [contract path built; real burn not demonstrated]
  -- attestation and mint --> Solana reserve [not demonstrated; TSN is on Devnet]
  -- commitment match --> TSN Node [existing system; not integrated or verified here]
  -- private balance credit --> Recipient [not built or tested in this project]
```

## 9. Safety design

The router has no refund path after a burn, so its pause only blocks new deposits and does not block already-burned funds. Reserve-recipient changes require a two-day delay, ownership renouncing is disabled, and the rescue function recovers only stray USDC. The router has no admin withdrawal for user funds. The separate funds-safety design in `docs/dip/DIPIngress-design.md` on branch `docs/dip-ingress-design` describes the full Arc-to-Solana path; it is a specification, not implemented code.

## 10. Honest status

| Status | What it means |
|---|---|
| Live | Router deployed on Arc Testnet only. The testnet deployment has a placeholder reserve recipient and shared Arc Studio deployer owner. No real USDC deposit has been sent. |
| Built | Router contract, 66 mock-based Foundry tests, security review and fix, responsive app, and DIP conformance report. |
| Specified | Full Arc-to-Solana funds-safety design in `docs/dip/DIPIngress-design.md`. |
| Not built or verified | Arc mainnet deployment and payment; TSN Node resolve endpoint and encrypted receipts; Solana mint and TCAP credit in this project. TSN is currently on Solana Devnet, with confidential debit and exit disabled. |

## 11. What is next

1. Deploy the existing tested router on Arc mainnet with a team-controlled Solana mainnet USDC token account as CCTP recipient, then verify one small payment. This is a plan, not a completed deployment. Since TSN is on Devnet, this payment would not reach the TSN reserve.
2. Run and verify the Solana mint and TCAP credit through the existing TSN system on Devnet.
3. Build the TSN Node resolve endpoint and encrypted receipts.
4. Implement epoch batching and equal-denomination deposits to weaken amount and timing correlation.
5. Build an exit rail to a one-time address and ERC-8004 agent binding for service payments to a TIN.

## 12. Why this can go further

Some payment flows start with an identifier rather than a wallet address. Dial tests an Arc deposit rail that accepts a TIN-derived commitment, while the TSN Node retains the identity mapping offchain. Arc and USDC fit the design because USDC is used for gas, Arc provides sub-second finality, and Circle CCTP provides the attested cross-chain money leg. A first TSN pilot would connect a verified Arc deposit to TSN's existing Devnet reserve and credit flow after those pieces are implemented and tested. The planned mainnet demonstration would use a team-controlled Solana mainnet token account, not the Devnet TSN reserve.

## 13. Team and links

- Builder profile: [TO FILL: public builder profile link]
- Repository: [TO FILL: public GitHub repository URL]
- TSN documentation: https://trust-link-tsn.mintlify.site/
- App header attribution: Powered by TSN, linking to the TSN documentation.

## 14. Tech stack

Solidity, Foundry, OpenZeppelin, Circle CCTP V2, Arc, React, Vite, TypeScript, wagmi, viem, ConnectKit and Tailwind.

## 15. Demo video script

**0:00–0:25** Show the contract in Arc Studio and identify `TSNArcDepositRouter` and its Arc Testnet deployment.

**0:25–0:50** Show the Foundry test results: 66 tests, including fuzz and invariant tests. Explain that they run against mocks.

**0:50–1:10** Show the security review finding about ownership renouncing while paused and the fix. Point out that the reviewer specification used four CCTP arguments while the contract uses the CCTP V2 seven-argument call.

**1:10–1:45** Show the app's Pay, Receipts, Privacy and Protocol tabs. Explain that the resolver is a labelled stand-in and that no real USDC deposit has been sent.

**1:45–2:05** In one sentence, explain the Privacy tab: “Arc exposes the payer, amount and timing, while the TIN and recipient are not stored onchain; timing and amount can still link activity.”

**2:05–2:35** Show the Arc Testnet router and deploy transaction on the testnet explorer. State that this is testnet evidence, not a real USDC payment.

**2:35–3:00** [TO FILL: after mainnet deployment and a real USDC transaction exist, show the mainnet router and transaction on explorer.arc.io, and state the amount; clarify that the Solana mainnet recipient is a team-controlled token account and the transfer does not reach TSN's Devnet reserve.]

## 16. Short forms

**X version (280 characters max):** Dial on Arc explores USDC payments addressed by a TIN-derived commitment instead of a wallet. The Arc Testnet router and app are built in Arc Studio. No real deposit has been sent; Solana mint and TCAP credit are not built or tested here. Mainnet proof is pending.

**50-word version:** Dial on Arc explores identifier-addressed USDC payments. A payer enters a TIN, and a demo resolver creates a salted commitment for an Arc router using Circle CCTP V2. The router is deployed on Arc Testnet, and the responsive app is built. No real deposit, Solana mint, or TCAP credit is verified in this project.

**One-line form description:** Pay a number, not a wallet: an Arc Testnet USDC router and app built in Arc Studio, with mainnet payment proof and TSN credit integration still pending.
