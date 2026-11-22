## What TSN Is

Transfer Settlement Network (TSN) is hybrid, decentralized settlement protocol infrastructure for the Internet of Value. It combines off-chain intent verification and work coordination with on-chain authorization, proof verification and asset accounting. TIP manages a ten-digit Transfer Identity Number (TIN), so the recipient identifier entered by a sender can remain distinct from the blockchain accounts used for execution.

The experimental first-release implementation focuses on Solana wallet deposits to private TIN credits. TCAP governs accepted assets and reserves; GPRU verifies private route and balance transitions without holding reserve tokens; TSNP authorizes settlement. Receiver, Node and Cranker have separate coordination, verification and submission responsibilities. Public wallet funding and Node access to sensitive witnesses remain privacy boundaries.

Planned expansion prioritizes lower-fee EVM targets such as Base, Arbitrum and Polygon PoS. These networks have fees and distinct security assumptions; Ethereum Layer 1 is outside the current integration priority. No completed TSN EVM payout route is established by this positioning. Optional provider-verified personal or business credentials associated with a TIN remain proposed work requiring owner consent, issuer validation, revocation and selective disclosure.

Use the [whitepaper](../docs/TSN-WHITEPAPER.md), [current ABI](../docs/laboratory/credit-abi.md) and [privacy record](../docs/laboratory/cryptography.md) for exact capability and evidence boundaries.
