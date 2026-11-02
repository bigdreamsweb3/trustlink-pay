# Historical architecture and research archive

This archive indexes preserved material at its existing paths. It removes superseded narratives from the current reading path without moving files, deleting research or claiming that every corresponding instruction was removed. The [current implementation map](../laboratory/architecture-map.md) is the canonical native-credit architecture.

## Explicitly retired concepts

[ZK-PRU](../ZK-PRU-RETIRED.md) is explicitly retired as the normal receiving/spending/balance architecture. Its historical purpose was exploring owner-derived receiving units and scoped spending authorities. Current TIP/GPRU/TCAP boundaries replace that narrative. Retired architecture does not authorize removing residual code without checking distinct capabilities and callers.

[TIN creation intent handoff](../TSN-TIN-CREATION-INTENT-HANDOFF.md) and [TIN Cranker data flow](../TSN-TIN-CRANKER-DATAFLOW.md) explicitly label earlier APIs/payloads as retired. Use the [canonical V1 issuance guide](../protocol-flows/tin-creation/README.md) instead.

## Superseded current-flow descriptions

- [One-time tip implementation](../ONE-TIME-TIP-IMPLEMENTATION.md), [TCAP TIN-tip V1](../tcap-tin-tip-v1.md), [historical credit smoke](../tcap-devnet-credit-smoke.md) and [historical debit fixture](../TCAP-V2-DEVNET.md) describe older instruction/account fixtures. Their original commands are not instructions to test current hidden-head credit.
- [Epoch/opaque-slot architecture](../TSN-FINAL-ARCHITECTURE.md), [Mother-rooted DNA](../tsn-mother-escrow-dna.md) and [epoch explorer notes](../tsn-transaction-explorer.md) describe a distinct retained program family. Historical here means superseded as the current native-credit narrative; its entrypoints still require capability/reachability review.
- [From ZK-PRU to GPRU/TCAP](../expo/FROM-ZKPRU-TO-GPRU-TCAP.md) and [TIP on-chain view](../expo/TIP-ON-CHAIN-VIEW.md) preserve earlier design/experiment notes. Their labels already establish that they are not current ABI guides.

## Independent research and external proposals

The [research repository](../../research/Trustlink-Research/README.md) is an independent Git checkout. Its README still names ZK-PRU as protected receiving/spending and expands TCAP as Token Control and Authorization Protocol, conflicting with current terminology and the TSNP/TCAP native credit CPI. These claims are HISTORICAL or UNVERIFIED for current behavior even when the paper is Published. This reconstruction preserves that repository unchanged and records the discrepancy rather than rewriting publication history.

The TLR-001 through TLR-008 papers include privacy, identity, intent/lease, ZK-PRU, TCAP, payment-graph and private-view topics. Each publication needs a version-specific source reconciliation before citation as a current guarantee. The alternate `TRL-001` directory is a short archival warning; do not silently conflate its identifier with TLR-001.

[Cross-network build plan](../CROSS-NETWORK-PAYMENTS-BUILD-PLAN.md), [cross-network research](../CROSS-NETWORK-PAYMENTS-RESEARCH.md), [DIP ingress design](../dip/DIPIngress-design.md) and [Arc integration material](../expo/ARC_INTEGRATION/PROTOCOL.md) retain proposals or route-specific experiments. A route claim needs deployed contracts, funding and source/destination execution evidence. Public submissions are not a substitute for those checks.

## Preservation rule

Record original title, path, known date/commit, former claim, current discrepancy and replacement reference. Do not fabricate an original decision date or successful experiment. If source still exports a historically described capability, distinguish its existence from active runtime use. Historical research remains useful even where its operational claims are no longer current.
