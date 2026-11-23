# TrustLink naming and protocol boundaries

**Status: CURRENT, positioning updated 2026-11-22; technical boundaries reconciled 2026-11-14.** Use these names in code, documentation and technical explanations. This vocabulary identifies responsibilities; the [architecture map](../docs/laboratory/architecture-map.md), [credit ABI](../docs/laboratory/credit-abi.md) and executable contracts establish route-specific behavior.

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

## Public positioning and integration scope

TSN is **Transfer Settlement Network: hybrid, decentralized settlement infrastructure being built for the Internet of Value (IoV)**. A blockchain-backed ten-digit TIN is the payment identity people and businesses share instead of exchanging wallet addresses. The full product vision connects confidential balances, identity-to-identity payments, wallet payouts, owner-consented verified credentials and supported blockchain networks, with privacy and recipient confidence as the purpose. Pitch and marketing copy should explain that complete network being built, then group development progress in its own slide or section. Technical references retain precise implementation and evidence classifications.

“Hybrid” describes off-chain verification and coordination with on-chain authorization and accounting. Solana supplies execution, ordering, consensus and finality. “Decentralized” describes the infrastructure direction and protocol enforcement, not evidence that every service or governance role is already permissionless.

The current experimental implementation centers on Solana wallet-to-TIN credit. Planned EVM evaluation prioritizes lower-fee networks such as Base, Arbitrum and Polygon; Base and Arbitrum are Ethereum Layer 2 networks, while Polygon PoS is an EVM sidechain. Gas fees still apply. Ethereum Layer 1 integration is outside the current scope because of transaction costs. A named candidate is not an implemented adapter, funded route or completed cross-network payment.

Use **TIN**, not CIN, for the ten-digit Transfer Identity Number. Resolved display names are owner-provided today. Signed credential-shaped metadata is a binding surface, not issuer verification. Optional issuer-backed names, business credentials and wallet-ownership attestations are planned; provider authentication, subject/TIN binding, expiry, revocation, consent and disclosure policy require an implemented verifier before claims can be labeled verified.

## First release and internal identifiers

TrustLink and TSN are still developing their first release, **v1**. Every current payment experiment, proof change and replacement belongs to that unfinished release; do not invent v2/v3 product releases, a release roadmap or production readiness from implementation changes. Existing serialized instruction names, account layout bytes, proof domains and owner-record tags must be quoted exactly when explaining their ABI. Their numeric suffixes identify internal encodings, not released product generations. Renaming those encodings requires coordinated program, SDK, service, artifact and stored-state review; a prose edit cannot change an on-chain discriminator.

## Lifecycle and status vocabulary

Native wallet-to-TIN credit requires canonical TIN-targeted approval and exact owner-signed TCAP funding. Receiver coordinates separate verification and leases. Node validates genuine funded-note membership through the existing global funding account and proves the private amount transition; Mother authorizes TSNP → TCAP → GPRU. Individual credit updates shared head/nullifier root and blinded epoch transcript with no token movement or liability reclassification. Separate `TCAP_EPOCH_ACCOUNTING` work proves the complete 2–64-credit total and reclassifies existing obligations once. This native epoch is distinct from retained TSNP Epoch Treasury/payout APIs.

Receiver statuses are `RECEIVED`, `NODE_VERIFYING`, `FUNDING_READY`, `VERIFIED`, `REJECTED`, `CRANKER_LEASED`, `SUBMITTED`, `CONFIRMED` and `FAILED`. `FUNDING_READY` records message-only authorization checks and permits owner funding approval; it supplies no Cranker execution. SDK intent status strings are a separate contract. Funding CONFIRMED, settlement CONFIRMED and validated owner-history recovery establish different outcomes. Check the route's actual handlers before describing recovery or enabled debit/exit.

## Privacy and evidence language

The privacy target is confidential TIN activity and public-observer unlinkability between TCAP actions, with public wallet funding and Node access to openings/routes accepted as intentional boundaries. Current experimental private credit proves exact funded-note amount/asset membership and uses secret-derived nullifiers and freshly blinded amount commitments. Individual plaintext amount and liability delta are absent; deposit amounts, epoch totals, token, roots, ciphertext, accounts and timing remain public. A single confirmed deposit can be credited without a pool account or source-count wait. Current or retained funding roots prove recorded funding; latest shared spending state prevents replay. Singleton funding histories, persistent recipient/head material and public registration-owner binding still limit unlinkability. See [cryptography](../docs/laboratory/cryptography.md) for exact source/evidence, including the unverified future private exit.

Keep CURRENT implementation, scoped test/VERIFIED evidence, EXPERIMENTAL, PROPOSED, DEPRECATED, RETIRED, HISTORICAL and UNVERIFIED distinct. A protocol name, source export, compiled artifact or Devnet program match is not an end-to-end payment or security audit. ZK-PRU is retired historical context. Older per-TIN TIP/epoch flows must not be used to describe current shared-root credit, while unique retained capabilities require separate review before removal.

Do not use DESP as an umbrella name. Preserve IDs, keys, account layouts and instruction ABIs unless separately authorized implementation changes them. Use the [maintenance manual](../docs/DOCUMENTATION_MAINTENANCE.md) for consistent status, terminology, diagrams and history.
