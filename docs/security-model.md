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
| TSN → GPRU → TCAP | Verifies the DNA-key/credit relation, then atomically advances TCAP's shared commitment root | The root is global, not a per-TIN head; current source does not prove the supplied predecessor is latest for that TIN. |

The encrypted Memo is transaction instruction data. TCAP does not store it in a
per-TIN balance account in the current credit path. Reading transaction
history requires RPC access or an indexer. GPRU/TCAP hidden-head instructions
exist separately in source but are not called by the current Node, SDK,
Cranker, or TSN credit path; their circuit does not establish balance
arithmetic, debit affordability, or solvency.

The current source therefore provides authorization checks, a GPRU credit
relation check, and global replay sequencing. It does not establish
zero-linkability, an authenticated latest memo per TIN, confidential debit or
exit, or a complete encrypted-balance proof system. See [Current architecture](./CURRENT-ARCHITECTURE.md)
and [GPRU/TCAP status](./gpru-tcap-route.md).
