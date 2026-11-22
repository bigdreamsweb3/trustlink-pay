# Cranker runtime scope

**Status: CURRENT source scope, reviewed 2026-11-22.** The daemon leases Receiver work and submits permitted Solana funding, TIN creation, native credit and complete epoch accounting. The retired EVM handler and its key-generation command are removed. There is no automatic adapter for the planned EVM networks.

The Solana owner pays the fee on an owner-signed funding wire; Cranker pays its constructed transactions. Mother settlement authorization, the Node decision key and the Cranker operator key are separate responsibilities. See the [transaction map](../../laboratory/cranker-transaction-map.md) and [operator guide](../../CRANKER-OPERATOR-GUIDE.md) for current contracts.

## Historical service findings

On 2026-09-13 the operator process started but challenge requests first returned HTTP 404 and then `CRANKER_OPERATOR_REVOKED_OR_UNKNOWN`. The local challenge route's existence did not prove that the deployed Receiver contained that source. A later Mother-DNA implementation was recorded at commit `550208d`, but an immediate probe still returned the older error. Those observations required independent deployment/project linkage and on-chain registration checks; a push did not establish service availability.

A successful challenge demonstrates authentication readiness, not work verification or chain settlement. The earlier EVM gas-funding receipt is preserved in the [historical address register](verified-addresses.md). It is not a current operator prerequisite.
