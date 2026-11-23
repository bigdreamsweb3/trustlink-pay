# What TSN Is

Transfer Settlement Network (TSN) is the hybrid decentralized blockchain settlement protocol infrastructure we are building for the Internet of Value. A ten-digit Transfer Identity Number (TIN) gives people and businesses a recognizable blockchain payment identity. They share a TIN rather than use a public wallet address as their everyday recipient identifier, while owner-consented attested credentials help senders recognize the person or business they intend to pay.

The complete product connects identity to exact approval, confidential value and supported settlement networks. Applications can support funding, holding, sending and receiving digital value through one identity and authorization model, with clear settlement receipts and recovery. Familiar payment experiences provide useful context for the interface; TSN remains the underlying blockchain identity and settlement infrastructure.

The architecture combines off-chain Receiver, Node and Cranker coordination with on-chain TIP identity, TSNP authorization, TCAP asset and reserve accounting, and GPRU proof verification. Solana is the settlement foundation; Base, Arbitrum and Polygon PoS are lower-fee EVM integration priorities with distinct security, fee and liquidity assumptions. Ethereum Layer 1 is outside the current focus. Credential recognition requires a supported issuer, correct identity binding, owner consent, expiry, revocation and selective disclosure.

## Development and evidence

The first release is still under development. Retained Solana Devnet evidence covers wallet-funded private TIN credit and complete aggregate accounting. Confidential spending, complete owner recovery, EVM delivery and credential-provider integration need separate implementation and verification. Sharing a TIN changes the user-facing payment identity; public wallet funding and other chain metadata remain privacy boundaries. Read the [whitepaper](../docs/TSN-WHITEPAPER.md), [current credit ABI](../docs/laboratory/credit-abi.md) and [privacy record](../docs/laboratory/cryptography.md) for exact technical and evidence boundaries.
