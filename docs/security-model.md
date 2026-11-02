# TSN security model

This page describes the source-backed TIN credit boundary. Receiver acceptance,
Node verification, Cranker submission, reserve-funding confirmation, and TCAP
transition confirmation are separate events. Only a confirmed TCAP transition
establishes that the credit state change executed.

| Boundary | Current role | Security limit |
| --- | --- | --- |
| Owner SDK → Receiver | Submits signed funding/payment intent data and authenticated work | The SDK's local balance view is not an on-chain authorization proof. |
| Receiver → Node | Stores ingress and leases authenticated work | Receiver acceptance alone does not verify a payment or settle it. |
| Node → TSN | Resolves TIP, validates work, and prepares authorized transition data | Node verification alone does not move TCAP assets. |
| Cranker → Solana | Submits the authorized transaction and pays transaction fees | The Cranker cannot change the transaction's authorized fields; submission alone is not confirmation. |
| TSNP → TCAP → GPRU | TCAP invokes GPRU's hidden-head proof/Memo verification before its atomic root/liability update | Local proofs and source wiring do not establish deployment, production cryptographic review or confirmed settlement. Public statement fields, ordering and funding wallets remain observable. |

The encrypted Memo is transaction instruction data. TCAP does not store it in a
per-TIN balance account in the current credit path. Reading transaction
history requires RPC access or an indexer. The current Node witness/prover
adapters and SDK/Cranker credit callers carry the twelve-input hidden-head
contract. The circuit constrains hidden membership, balance arithmetic and
nullifier insertion; TCAP separately checks reserve solvency.

The current source provides authorization, hidden-head proof verification and
shared-root accounting. Local proofs/builds were verified separately; current
chain/configuration and complete settlement/history recovery remain unverified
here. Confidential debit/exit and metadata unlinkability must not be inferred
from source presence. See [Current architecture](./CURRENT-ARCHITECTURE.md)
and [GPRU/TCAP status](./gpru-tcap-route.md).
