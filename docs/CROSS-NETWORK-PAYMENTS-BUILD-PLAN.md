# Cross-network integration plan

**Status: PROPOSED, revised 2026-11-22.** This is a requirements plan for lower-fee EVM integrations, not a runtime contract or an announcement of enabled routes. Current Solana wallet-to-TIN credit is a separate experimental capability described in the [architecture map](laboratory/architecture-map.md) and [credit ABI](laboratory/credit-abi.md).

## Scope and network selection

TSN is hybrid, decentralized settlement infrastructure for the Internet of Value. Off-chain services coordinate and verify work; on-chain programs enforce authorization and accounting. Future network support must preserve those responsibility boundaries rather than infer interoperability from an EVM address or an SDK export.

Base, Arbitrum and Polygon are the current evaluation priorities because transaction costs matter for payment-sized transfers. Base and Arbitrum are Ethereum Layer 2 networks; Polygon PoS is an EVM sidechain. These networks charge gas, and end-to-end cost also depends on source execution, proof or messaging transport, and liquidity. Ethereum Layer 1 integration is outside the current scope because of its fees. No candidate has an enabled TSN destination route established by this plan.

## Contract review before implementation

Choose one destination, asset and explicit ingress or payout direction before implementation. Review its finality, official token issuance, custody/liquidity model, failure recovery and available proof or transport mechanism. No intermediary chain, external attestation service, new signing key or signer-governance mechanism is adopted by this document.

The route specification must bind source and destination domains, exact asset contracts and decimals, amount, recipient, authorization, expiry and one-time consumption. It must explain how source funding or debit is authenticated independently of a Node statement, what destination liquidity pays the recipient, and how retries reconcile both chains. A native credit receipt is not an export authorization. Retained Epoch Treasury/AcceptedIntent APIs must not be substituted for the current private-credit ABI without a separate source review.

Inspect the participating programs, SDK, Receiver, Node and Cranker before editing. The Node verifies and prepares permitted work; Receiver coordinates leases; Cranker submits exact authorized terms. Any new destination contract must enforce its own domain, authorization, replay and liquidity checks. Key ownership, rotation and governance need an explicit reviewed contract if the selected route requires them.

## Evidence gates

1. Reconcile the chosen source/asset/accounting contract and document public/private fields, cancellation and outstanding-liability behavior.
2. Implement the destination adapter and rejection checks for substituted amount, asset, decimals, recipient, domain, expiry, replay, unsupported route and unavailable liquidity.
3. Verify exact deployed bytecode/accounts, route configuration, token provenance, finality assumptions and available liquidity on the selected test network.
4. Retain a complete source authorization/funding or debit receipt, transport/proof evidence where applicable, destination transaction and recipient-state result; test duplicate submission and interrupted reconciliation.

A source build, enabled registry entry, UI readiness label or destination vault balance proves only that specific observation. Publish network support after the full route evidence exists and record its cluster, version, date and limits. Mainnet support, atomic cross-chain execution, automated refunds and general multi-asset routing are not implied.

## Documentation and operations

Update internal contract/runbook records and the [public integration guidance](../tsn-protocol/tsn-docs/sdk/integrations.mdx) with each implemented route. The retired prototype's addresses and results are preserved as [historical evidence](team/cross-chain/verified-addresses.md); they are excluded from route admission and must not be relabeled as deployments on a planned network. The next demo remains native wallet deposit to TIN credit, with separate funding, settlement and owner-history evidence.
