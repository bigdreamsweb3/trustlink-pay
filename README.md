# TrustLink Pay

> Identity-first stablecoin payments on Solana, powered by Transfer Identity and the Transfer Settlement Network (TSN).

TrustLink Pay lets people send stablecoins to a 10-digit Transfer Identity Number (TIN) instead of sharing wallet addresses. It combines portable payment identity, ZK-PRU protected receiving authorization, and the Transfer Settlement Network (TSN) so a normal payment experience does not need to expose a simple sender-wallet-to-recipient-wallet path.

## What it does

- Uses a TIN as the public payment identity rather than a wallet address.
- Resolves recipient context before a payment is authorized.
- Routes supported balance through ZK-PRU authorization and TSN settlement workflows.
- Uses TSN Cranker coordination, authorization records, fees, and settlement receipts for payment execution.
- Keeps the owner's primary wallet out of TIN creation, upgrade, and TSN settlement transactions as an on-chain signer, fee payer, or authority.

TrustLink Pay improves the privacy design of everyday payments. It does not make Solana private: transactions and program accounts remain public, and on-chain activity can still be inspected with enough context.

## Architecture

| Layer | Responsibility |
| --- | --- |
| TIP | TINs, phone routing, identity resolution, optional trust context, attestations, and credentials |
| TSN | Payment intents, epochs, Crankers, settlement coordination, fees, authorization, and receipts |
| TCAP | Confidential asset representation, reserve metadata, commitments, nullifiers, and confidential roots |
| ZK-PRU | TSN privacy authorization and purpose-bound protected receiving identities |

Transfer Identity combines payment identity with optional identity assurance. Every TIN remains payment-capable without an attestation. Legal-name, business-name, and personhood attestations provide additional recipient confidence when available.

The Solana Attestation Service (SAS) is the designated credential framework for identity assurance. SAS credentials remain outside TSN payment execution and credential contents do not become public on-chain payment records. Credential-provider connectivity follows the SAS provider interface.

## Read the documentation

Start with the [documentation portal](./docs/README.md).

- [Start Here](./docs/START-HERE.md) — product and protocol overview
- [Architecture](./docs/ARCHITECTURE.md) — system boundaries and components
- [Transfer Identity](./docs/TRANSFER-IDENTITY.md) — TINs, ZK-PRU authorization, and protected route authentication
- [TSN](./docs/TSN.md) — payment execution and settlement design
- [Developer Guide](./docs/DEVELOPER.md) — local development and integration rules
- [Security](./docs/SECURITY.md) — security boundaries and privacy limits

## Development status

The repository contains the TrustLink Pay web app, backend, Transfer Identity program and SDK, TSN SDK, mempool services, RPC gateway, and reference Cranker operator. Development and protocol validation are active on Solana devnet.

Current devnet program IDs:

| Program | Address |
| --- | --- |
| Transfer Identity | `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` |
| TSN | `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V` |

## Milestones and ecosystem support

TrustLink Pay has progressed through StableHacks and The Bags Hackathon, and received support through the Superteam Agentic Engineering Grant program for fraud-protection development. The factual project history and acknowledgements are in [Project Journey](./docs/PROJECT-JOURNEY.md).

## Repository map

| Path | Purpose |
| --- | --- |
| `frontend/` | TrustLink Pay web application |
| `backend/` | API, user and payment records, notifications |
| `transfer-identity-protocol/` | Transfer Identity program and SDK |
| `tsn-protocol/` | TSN SDK, mempool, RPC gateway, and Cranker tooling |
| `docs/` | Product, protocol, security, and developer documentation |

## Local development

For the Windows-native development workflow, see [Windows TSN Commands](./docs/WINDOWS-TSN-COMMANDS.md). The default PM2 stack runs the frontend, backend, and RPC gateway; mempool services and the Cranker are explicit opt-in processes.

## License

[MIT](./LICENSE)
