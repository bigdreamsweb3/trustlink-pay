# ADR-002: shared-root credit with atomic reserve classification

**Status: HISTORICAL reconstructed November 2 decision.** Its individual reserve-classification behavior is superseded by [ADR-005](ADR-005-private-amount-and-adaptive-pools.md), which retains shared-root credit while moving liability classification into complete aggregate epoch proof work. Original approval date was not established. The original rationale below is preserved as historical context; [current ABI](../credit-abi.md) directs new implementation.

## Context and problem

Earlier documents describe public per-TIN tip state or epoch-specific payout accounting. The current credit ABI instead proves a hidden recipient head change against a protocol-wide root and applies the matching reserve-liability change in TCAP.

## Decision and rationale

The native path confirms a wallet-signed reserve deposit first. Node prepares a transaction-specific hidden-head proof; Mother authorizes the exact root/sequence/token/amount/nullifier context. TCAP invokes GPRU before advancing its shared root and shifting equal liability from pending to settled confidential state. This gives an explicit transaction-atomic accounting boundary and avoids a per-TIN latest-tip account in that credit call.

## Alternatives and consequences

The [historical per-TIN tip note](../../tcap-tin-tip-v1.md) and [epoch-slot architecture](../../TSN-FINAL-ARCHITECTURE.md) establish earlier documented approaches. They do not establish a full comparative evaluation or prove their runtime entrypoints were removed. Current libraries retain distinct historical/other-capability families.

The shared root exposes global ordering and creates root-contention/stale-witness concerns. A root change requires reconstruction/re-authorization from confirmed current state. Funding and settlement remain separate transactions, so a failed credit cannot automatically undo an earlier deposit. Confidential debit/exit needs separate execution evidence; credit source does not establish every conservation/payout path.

Evidence: [TCAP credit](../../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_gpru_memo_v1.rs), [witness reconstruction](../../../tsn-protocol/services/tsn-node/hidden_head_witness.py), [Node transition preparation](../../../tsn-protocol/services/tsn-node/server.py), and [credit ABI](../credit-abi.md).
