# TrustLink naming and protocol boundaries

**Status: CURRENT, reconciled 2026-11-02.** Use these names in code, documentation and technical explanations. This vocabulary identifies responsibilities; the [architecture map](../docs/laboratory/architecture-map.md), [credit ABI](../docs/laboratory/credit-abi.md) and executable contracts establish route-specific behavior.

| Name | Meaning | Boundary |
| --- | --- | --- |
| **TSN** | Transfer Settlement Network | Complete TrustLink settlement infrastructure: programs, Receiver, Nodes, Crankers, SDK and applications. |
| **TSNP** | Transfer Settlement Network Protocol | On-chain settlement authorization program; the internal crate retains `trustlink_escrow`. Naming does not rename its ID or ABI. |
| **TIP** | Transfer Identity Protocol | TIN registration, identity/recovery records and authenticated shared route membership. Direct and staged creation remain source capabilities. |
| **TIN** | Transfer Identity Number | Ten-digit identity managed by TIP; neither a wallet key nor a public balance account. |
| **GPRU** | Guarded Privacy Routing Unit | Verifies hidden route/head, balance transition, nullifier and Memo-bound proof relations; does not custody TCAP reserves. |
| **TCAP** | Transfer Confidential Asset Protocol | Accepted-asset governance, reserve liquidity/liabilities, funding and atomic shared-root settlement accounting. |
| **Receiver** | Durable ingress and work coordination | Validates ingress, stores restricted work, coordinates versioned leases/decisions and reports results. Acceptance is not settlement. |
| **TSN Node** | Off-chain verification service | Resolves routes, verifies authorization/funding, handles sensitive witnesses/Memo construction and returns signed decisions. |
| **Cranker** | Leased transaction submitter | Verifies Node execution projection and submits permitted transactions; unchanged sender-signed funding cannot be replanned or signed for the user. |
| **Mother authority / Mother Escrow** | TSNP authorization boundary | Mother authority co-signs inspected settlement; Mother Escrow is the on-chain account/authority context, not a synonym for every Node. Decision signing and Mother authority are separate roles/keys. |
| **Epoch Treasury** | Aggregate epoch funding/liability account family | Retained separate epoch/payout/refund capability, not a native hidden-head credit stage. |
| **Settlement DNA** | Transaction-specific material in retained settlement APIs | Describe its exact instruction/cryptographic context; it is not a replacement for a valid hidden-head proof or funding confirmation. |
| **DIP** | Deposit Ingress Protocol | Named ingress boundary; an external adapter is supported only where its concrete implementation/deployment proves it. |
| **CCTP** | Circle Cross-Chain Transfer Protocol | External Circle integration, distinct from TrustLink protocol layers. |
| **DBrix Memo** | Serialized encrypted owner action record in transaction data | Memo is instruction data, not a persistent balance account or independent proof of correct arithmetic. |
| **TSN SDK / TSN XP** | Developer client library / application experience | SDK prepares documented approvals and requests; XP presents the user flow. Neither supplies deployment or settlement proof by displaying success. |

## Lifecycle and status vocabulary

Native wallet-to-TIN credit requires canonical TIN-targeted approval and an exact owner-signed TCAP deposit. Receiver pre-creates a RECEIVED settlement reference at ingress; confirmed funding gates its independent Node verification. Root-selected witness/local proving precedes lease-bound Mother authorization and TSNP → TCAP → GPRU validation. TCAP advances the shared root and pending/settled liabilities atomically. Credit is a confidential-state transition, not a recipient wallet payout.

Receiver statuses are `RECEIVED`, `NODE_VERIFYING`, `VERIFIED`, `REJECTED`, `CRANKER_LEASED`, `SUBMITTED`, `CONFIRMED` and `FAILED`. SDK intent status strings are a separate contract. Funding CONFIRMED, settlement CONFIRMED and validated owner-history recovery establish different outcomes. Check the route's actual handlers before describing recovery or enabled debit/exit.

## Privacy and evidence language

Hidden TIN/head/path witnesses do not establish full transaction unlinkability. Current credit publishes a nullifier computed from public TCAP program and confirmed deposit-signature bytes, permitting a funding-to-credit link. Amount, asset, roots, successor point, ciphertext, accounts and timing remain public; Node handles sensitive routing/witnesses. Cite [cryptography](../docs/laboratory/cryptography.md) for the relation instead of promising owner-only knowledge or no public funding pointer.

Keep CURRENT implementation, scoped test/VERIFIED evidence, EXPERIMENTAL, PROPOSED, DEPRECATED, RETIRED, HISTORICAL and UNVERIFIED distinct. A protocol name, source export, compiled artifact or Devnet program match is not an end-to-end payment or security audit. ZK-PRU is retired historical context. Older per-TIN TIP/epoch flows must not be used to describe current shared-root credit, while unique retained capabilities require separate review before removal.

Do not use DESP as an umbrella name. Preserve IDs, keys, account layouts and instruction ABIs unless separately authorized implementation changes them. Use the [maintenance manual](../docs/DOCUMENTATION_MAINTENANCE.md) for consistent status, terminology, diagrams and history.
