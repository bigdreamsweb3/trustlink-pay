# Future EVM adapter scope

**Status: PROPOSED checklist; no adapter is implemented in this directory.** Base, Arbitrum and Polygon are planning targets selected for lower transaction fees. Ethereum L1 is outside the current integration scope. An adapter requires a concrete supported asset, authenticated source evidence, destination executor/liquidity policy, replay protection, finality, fee handling and recovery rules.

Implement and verify those contracts before exposing a route through Node admission or SDK settlement methods. Preserve native Solana authorization, privacy and liability boundaries. Retained prototype contracts and local validators provide research context; they do not grant route authority or establish a completed cross-network payment.
