DO NOT SUBMIT YET: mainnet proof is missing. Testnet-only builds are not eligible.

# Submission notes for Dial on Arc

## Missing items

- Arc mainnet router address and explorer link.
- Mainnet USDC transaction hash, explorer link and exact amount.
- Solana mainnet receipt transaction hash and explorer link. The proposed mainnet recipient is a team-controlled Solana mainnet USDC token account; the transfer does not reach the TSN reserve because TSN is on Devnet.
- Public Arc Studio project URL.
- Public repository URL.
- Live app URL.
- Demo video URL.
- Public builder profile link.
- Confirm whether TSN or this work has received Circle or Arc program funding. The hackathon excludes work already funded by a Circle or Arc program.
- If the name matters for submission, check whether another Arc or Circle project already uses “Dial”; this has not been checked.

The current hackathon detail page says submission requires a mainnet deployment and at least one Arc mainnet transaction moving USDC, and that testnet-only projects are ineligible. It also states submissions close November 1, 2026, with an on-page deadline of November 2, 2026 at 05:59 UTC+1 (Africa/Lagos local time). Resolve the exact deadline basis on DoraHacks before relying on it.

## Verify before submission

- Confirm the mainnet router address and transaction match the intended contract and show a successful USDC transfer through that contract.
- Confirm transaction amount and token on explorer.arc.io. Do not imply this amount reached TSN.
- Confirm the Solana receipt transaction is on Solana mainnet and landed in the team-controlled token account. This receipt is separate from TSN's Devnet reserve.
- Confirm public accessibility of the Arc Studio project, repo, app, video and builder profile links.
- Confirm the app demo resolver remains clearly labelled and does not imply a Node resolve endpoint exists.
- Confirm the 66 tests are the current test count and refer to mock-based tests.
- Confirm the UI currently has Pay, Receipts, Privacy and Protocol tabs and the header says “Powered by TSN” with the TSN docs link.
- Confirm the Circle or Arc prior-funding eligibility question is resolved.
- The safety design at `docs/dip/DIPIngress-design.md` is a specification only. Do not present it as implemented code.

## Explorer verification checklist

| Page item | How to confirm | Expected result |
|---|---|---|
| Arc Testnet router `0x2e4c2fd26403d121bb5d1eb9a1dc6aaa3feda5f1` | Open https://explorer.testnet.arc.io/address/0x2e4c2fd26403d121bb5d1eb9a1dc6aaa3feda5f1 | Address page identifies the deployed router on Arc Testnet. |
| Testnet deploy transaction `0x4c2632c68a37de8ad44a3ec0ed8e1140c2e5ee15221a2d57e792c180982af3df` | Open https://explorer.testnet.arc.io/tx/0x4c2632c68a37de8ad44a3ec0ed8e1140c2e5ee15221a2d57e792c180982af3df | Successful deployment transaction whose created contract is the router address above. |
| Arc mainnet router `[TO FILL: Arc mainnet router address]` | Open `https://explorer.arc.io/address/[TO FILL: Arc mainnet router address]` | Deployed router on Arc mainnet; verify its code and address. |
| Mainnet transaction `[TO FILL: real USDC transaction hash]` | Open `https://explorer.arc.io/tx/[TO FILL: real USDC transaction hash]` | Successful transaction calls the router and moves the stated small amount of USDC. Verify this is not represented as funding TSN's Devnet reserve. |
| Solana mainnet receipt `[TO FILL: Solana mainnet receipt transaction hash]` | Open `[TO FILL: Solana mainnet explorer transaction link]` | Successful receipt into the team-controlled Solana mainnet USDC token account. |

The mainnet and Solana placeholders must be replaced with verified values before the page is submitted. If a transaction does not meet the expected result above, correct or remove the associated claim and proof row.

## Skeptical-judge edits and removals

- Removed “Arc never learns who was paid” because the supplied facts say payer address, amount and timing are public, and the Node holds the identity link.
- Removed “Powered by TSN, by TrustLink Labs” and retained only the updated “Powered by TSN” app attribution.
- Reframed the five-step lifecycle as a mix of built, intended and unverified legs. The real deposit, Solana mint and TCAP credit have not been demonstrated in this project.
- Replaced assertions of actual payment delivery with the current router behavior and a clearly labelled future plan, because no real USDC has moved through the router.
- Did not claim the router is deployed to mainnet, that a mainnet transaction exists, or that the planned transfer reaches the TSN reserve.
- Kept the privacy claim narrow: the TIN and recipient are not stored onchain, while payer, amount and timing remain observable or correlatable.
- Described the DIP ingress funds-safety work as a specification only, not deployed or implemented behavior.
- Omitted a claim that the project is eligible for funding because prior Circle or Arc funding status is unresolved.
