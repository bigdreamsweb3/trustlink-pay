## Transfer Settlement Network (TSN)

### Hybrid decentralized settlement protocol infrastructure for the Internet of Value

**Status:** Revised project copy, 2026-11-22. Experimental first-release Solana implementation; planned lower-fee EVM integration and optional credential attestations. This draft is not evidence of an external submission or live payout route.

**Track:** DeFi: payments and settlement infrastructure.

**Pitch deck:** [TSN protocol pitch](https://trustlink-labs.github.io/TSN-Pitch-Deck/)

**Documentation:** [TSN handbook](https://trust-link-tsn.mintlify.site/)

![TSN hybrid infrastructure and experimental native credit](assets/tsn-hybrid-architecture.svg)

## Product and problem

Transfer Settlement Network (TSN) combines off-chain verification and work coordination with on-chain authorization, proof verification and reserve accounting. A ten-digit Transfer Identity Number (TIN) gives applications a human-facing recipient identifier while keeping identity distinct from blockchain execution accounts. TrustLink Pay is the reference payment experience built on this infrastructure.

Blockchain payments remain fragmented across addresses, assets, fees and network-specific settlement mechanisms. Public transfers can expose counterparties and amounts, while a displayed success or relayed message may not establish final delivery. TSN separates identity, exact owner approval, verified funding, private credit, reserve accounting and settlement evidence.

## Current Solana credit flow

1. The sender approves a canonical TIN-targeted intent, then separately signs the exact TCAP deposit.
2. Receiver coordinates work and leases; Cranker submits the owner-signed funding wire unchanged.
3. TCAP verifies the actual asset transfer and appends an amount-and-asset-bound funded leaf. Node requires confirmed funding before preparing settlement.
4. Node resolves the current TIP route, constructs the private witness and owner Memo, and proves the exact funded amount transition.
5. Mother authorizes TSNP, Cranker submits the permitted transaction, and TCAP invokes GPRU before advancing shared head/nullifier state and the blinded credit-epoch transcript.
6. A separate complete aggregate proof covers 2-64 accepted credits and reclassifies their authenticated total. An individual credit requires only one genuine confirmed deposit.

The November 16 retained Solana Devnet checkpoint verifies two finalized private credits and complete aggregate accounting. This copy does not establish today's deployed state, complete owner recovery, confidential debit, wallet exit or production readiness.

## Protocol responsibilities

TIP manages TIN registration, authenticated route membership and owner recovery. TSNP is the on-chain settlement authorization program. TCAP governs accepted assets, custody reserves, funded obligations and confidential accounting. GPRU verifies hidden route, amount, balance, nullifier and Memo relations without holding reserve tokens. Receiver manages durable coordination; Node handles verification and sensitive witnesses; Cranker submits exact permitted transactions and pays its network fee.

## Planned low-fee EVM integration

Base, Arbitrum and Polygon PoS are candidate destination networks. Base and Arbitrum are Ethereum Layer 2 networks; Polygon PoS is an EVM sidechain with different security assumptions. They have transaction fees, even if an application sponsors gas. Ethereum Layer 1 is outside the current priority because of the intended low-cost payment experience.

Each route requires reviewed source-finality evidence, destination authentication, exact recipient and token binding, replay rejection, actual value delivery, monitoring and partial-failure recovery. A supported transfer mechanism or prefunded destination liquidity must supply the payout asset. No completed TSN EVM payout route, universal verifier or guaranteed integration order is claimed.

## Proposed credential attestations

A future extension could associate provider-verified personal or business credentials with a TIN for recipient confirmation. It requires owner consent, a supported issuer and schema, correct TIN binding, revocation and expiry checks, and selective disclosure. No Solana Attestation Service or Sumsub integration is claimed; wallet control and a registered name are distinct from legal-identity verification.

## Privacy and security

The private-credit amount is committed privately and its nullifier derives from a funding-note secret. Wallet funding, token identifiers, roots, ciphertext, accounts, timing and aggregate totals remain public; Node intentionally handles private routes and openings. Sparse or known-amount histories and public owner-registration binding can limit unlinkability. Independent cryptographic review and complete owner recovery remain separate checks.

## Liquidity and fees

TCAP reserve funding and aggregate liabilities belong to the Solana asset-accounting contract. Future cross-network routes need actual value-transfer support or destination liquidity. Native tokens cover network gas; stablecoins are the intended payment asset. Fee policies and operator economics must be evidenced for the particular route, rather than described as an already deployed universal fee model.

## Demo and resources

Demo video 1 covered TIN creation during the earlier hackathon. Demo video 2 is the planned wallet-deposit-to-TIN-credit demonstration after documentation publication. Existing media templates are historical planning assets and are not a completed current demonstration.

- [Current whitepaper](../../docs/TSN-WHITEPAPER.md)
- [Current credit ABI](../../docs/laboratory/credit-abi.md)
- [November 16 bounded evidence](../../docs/laboratory/experiments/EXP-20261116-private-credit-epoch.md)
- [TSN implementation repository](https://github.com/bigdreamsweb3/trustlink-pay)
- [TSN public protocol repository](https://github.com/Trustlink-Labs/TSN-Protocol)
- [Research publication](https://tsn-protocol.blogspot.com/)
