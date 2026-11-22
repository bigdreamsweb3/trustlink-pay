# TSN: Hybrid Settlement Infrastructure for the Internet of Value

**Status: EXPERIMENTAL first-release v1 infrastructure; publication revised 2026-11-22.** Current descriptions follow the [architecture map](./laboratory/architecture-map.md), [private-credit ABI](./laboratory/credit-abi.md) and [cryptographic boundaries](./laboratory/cryptography.md). The retained [November 16 Devnet checkpoint](./laboratory/experiments/EXP-20261116-private-credit-epoch.md) establishes two finalized private credits and their complete aggregate accounting. That evidence does not establish production readiness, general unlinkability, complete owner recovery, confidential debit or cross-network delivery.

## Abstract

Applications can address digital value through a ten-digit payment identity while the owner authorizes the exact transfer. TrustLink Labs is building **Transfer Settlement Network (TSN)** as hybrid, decentralized settlement protocol infrastructure for the **Internet of Value (IoV)**. Its purpose is to route value using payment identities and exact authorizations while keeping identity, coordination, cryptographic verification and asset accounting distinct. Hybrid describes the combination of off-chain Receiver, Node and Cranker services with on-chain authorization, proof verification and reserve accounting. TSN relies on the underlying blockchain's consensus and on explicit service and governance trust boundaries.

**TIP (Transfer Identity Protocol)** manages a **TIN (Transfer Identity Number)**, a ten-digit payment identity. **TSNP (Transfer Settlement Network Protocol)** authorizes settlement on chain. **TCAP (Transfer Confidential Asset Protocol)** governs approved assets, custody reserves, funding records and confidential liabilities. **GPRU (Guarded Privacy Routing Unit)** verifies hidden route and balance transitions; it does not hold reserve tokens. **DIP (Deposit Ingress Protocol)** names a separate ingress boundary, and Circle's **CCTP (Cross-Chain Transfer Protocol)** is an external integration whose availability must be established for each route.

The current experimental settlement domain is Solana. Planned EVM expansion prioritizes lower-fee networks such as Base, Arbitrum and Polygon PoS, subject to route-specific implementation and security evidence. Base and Arbitrum are Ethereum Layer 2 networks; Polygon PoS is an EVM sidechain with different security assumptions. These networks have transaction fees, and a sponsored user experience still has an underlying cost. Ethereum Layer 1 integration is outside the current priority because its fee model is unsuitable for the intended low-cost payment experience. No live TSN payout route on these EVM targets is established by this paper.

## 1. Identity and the Internet of Value

A TIN separates the identifier a sender enters from the blockchain accounts used for execution. TIP maintains identity registration, owner recovery records and authenticated route membership. A TIN is neither a private key nor a public token balance account. The sender authorizes the recipient TIN, asset, amount, fee and validity window; the Node resolves the permitted recipient route and verifies its relationship to current TIP state.

The IoV direction is a payment identity that applications can use to coordinate value across supported settlement environments. Portability is a design goal, not evidence that every network currently accepts the identity. Each new environment requires its own asset, authorization, liquidity, finality, execution and recovery contract.

Optional credential attestations are a proposed extension. An owner could associate a provider-verified personal or business name with a TIN and selectively present that credential during recipient confirmation. Integration requires a supported issuer, schema, owner-consent flow, binding to the intended TIN, revocation and expiry handling, and a policy for disclosure. No integrated Solana Attestation Service or Sumsub identity-verification flow is established by the inspected TSN implementation. Wallet control, a registered name and a government-verified identity remain different claims.

## 1A. Application and developer workflows

Wallet and payment applications can use the current experimental Solana SDK flow to prepare a TIN-targeted intent, request owner funding approval and track the separate funding and settlement outcomes. Applications must surface failures accurately and reconcile successful settlement with chain evidence before presenting a private credit as complete.

Merchant recipient confirmation is a future credential use case: an opted-in verified business name could help a sender assess the intended TIN, subject to issuer, validity and disclosure policy. It is not a deployed TSN verification service. Developers integrating new networks must establish the route-specific value, finality, authorization and recovery contracts before offering payments on that network.

## 2. Participants and authority

The owner wallet signs the canonical payment intent and separately approves the exact funding transaction. The SDK prepares these approvals and requests. Receiver stores restricted ingress and manages versioned decisions and leases. Acceptance by Receiver records work; it does not settle value.

Node verifies signatures, recipient route, asset policy, funding evidence and the private transition. It intentionally handles sensitive routes, witnesses and amount openings. Mother authority co-signs the inspected settlement within TSNP's authorization boundary. A Node decision signature and Mother authorization have distinct roles.

Cranker claims leased work, checks the Node's execution projection and submits permitted transactions. It submits the owner's funding wire unchanged and cannot replace its fields or sign on the owner's behalf. For native settlement, its fee-payer signature follows Mother authorization. Chain execution enforces the bound accounts, validity window, current state and proof; an operator response alone does not establish chain acceptance.

## 3. Solana wallet deposit to TIN credit

The active private-credit flow has separate funding and settlement transactions:

1. The sender reviews and signs a canonical TIN-targeted intent. Node verifies message-only authorization and Receiver records funding readiness.
2. The owner explicitly approves the exact TCAP deposit with a fresh blockhash and wallet signature. Receiver links funding and settlement work; Cranker submits that signed deposit unchanged.
3. TCAP verifies the actual SPL token transfer into its reserve vault, records pending liabilities and appends an asset-and-amount-bound funded leaf atomically. Node requires confirmed funding before preparing the credit.
4. Node selects authenticated funding membership, reconstructs current TIP and TCAP witnesses, constructs the encrypted owner Memo and proves the private amount transition. Mother authorizes the inspected TSNP transaction.
5. Cranker submits the authorized TSNP call followed by its bound Memo. TSNP invokes TCAP, and TCAP invokes GPRU. Proof success advances the shared head/nullifier root and appends the blinded credit commitment to the asset epoch atomically.
6. Separate complete aggregate accounting verifies the accepted epoch transcript and reclassifies its authenticated total from pending to settled confidential liabilities. Owner history and balance recovery require their own validation.

A single genuine confirmed deposit can support an individual credit. There is no funding-pool creation, source-count wait or capture transaction in this runtime. Individual credit transfers no reserve tokens and makes no public per-credit liability reclassification. The TCAP accounting epoch is distinct from the retained TSNP Epoch Treasury, AcceptedIntent, payout and refund instruction family.

## 4. Funding membership, private state and proof

TCAP's global funding account authenticates current and up to 128 retained root/count pairs. A proof-selected root must remain in that history, while spending uses the latest shared head/nullifier state. Historical funding membership cannot restore a spent note. An evicted funding root or changed shared state requires fresh unsigned verification; signed attempts require exact receipt reconciliation.

The current private-credit statement has thirteen public inputs: predecessor and successor shared roots, Memo and action commitments, nullifier, TIP route root, successor portfolio root, successor balance point coordinates, encrypted blinding delta, ephemeral point coordinates and authenticated funding root. Private witnesses establish recipient route/head membership, the selected asset's balance opening, exact funded amount and amount-commitment blinding.

The spend nullifier derives from a private funding-note secret, rather than a public deposit signature. Fresh blinding hides the individual amount commitment. GPRU verifies the Groth16 statement and binds the following Memo's bytes and prefix fields to it. Its circuit-specific development proving key, verifier key and initialized accounts must match the running ABI; compilation or a decryptable Memo does not independently establish a valid settlement.

The owner-encrypted action record is transaction instruction data, not a persistent public balance account. Owner-held scan material recovers the proof-bound blinding delta. Recovery must validate commitment openings, authorization, sequence and predecessor linkage against the actual settled statement. Complete owner recovery remains a separate unverified outcome in the cited checkpoint.

## 5. Reserve and aggregate liability accounting

TCAP holds approved reserve assets and tracks funded obligations. Each successful private credit contributes a blinded commitment and nullifier to an ordered asset-specific transcript. Node reconstructs every accepted credit and uses its restricted amount-opening journal to prepare the separate aggregate proof. Receiver serializes this work around the shared private root; Cranker submits the account operation.

The aggregate circuit requires the complete ordered set of 2–64 credits. TCAP verifies that proof through GPRU before moving the authenticated total from pending to settled confidential liabilities, advancing the accounting epoch and marking the prior epoch accounted. Custody assets, total liabilities and uncredited pending funding are unchanged. A singleton credit can remain in its open accounting epoch indefinitely; the batch minimum is not a requirement for crediting an individual deposit.

Current scheduling queues accounting at 64 credits, or after 120 slots for a batch of 2–63. Those are Node scheduling rules; the on-chain proof check has no 120-slot expiry. Accounted epoch accounts remain on chain, and automatic timeout refunds or rent reclamation are not implemented by this path. Mixed debit, transfer and exit accounting remains proposed work.

## 6. Cross-network settlement direction

A settlement domain has its own consensus, finality, asset contracts and transaction rules. Future domain adapters must map a verified authorization into the selected environment while preserving exact recipient, token, amount, fee, nonce and validity bindings. Base, Arbitrum and Polygon PoS are candidate lower-fee EVM targets, not enabled routes or a guaranteed deployment order.

Cross-network implementation must establish source finality and verifiable evidence, destination message authentication, replay rejection, execution authority and recovery after partial progress. The team must select and validate the connection mechanism for each route; this whitepaper does not prescribe an unimplemented bridge, universal attestation provider or chain-native verifier.

A proof or message is not a payment asset. Destination settlement also needs an actual supported value-transfer mechanism or prefunded liquidity in the registered token and vault. Native network tokens pay gas; stablecoins are the intended payment asset. A liquidity observation, source receipt or accepted message must not be presented as the final recipient payout.

## 7. Route admission and governance

Community route governance is a proposed admission process. A proposal must identify the destination network, chain identifier, executor, token, liquidity model, finality assumptions, source-evidence mechanism, gas costs, monitoring and failure recovery. Technical and security review precede any decision to activate a route. Community approval cannot create liquidity or override a sender-signed authorization.

Before operational governance can be claimed, the team must establish voter eligibility, quorum, duplicate-vote and sybil controls, proposal expiry, timelocks, conflict disclosures, emergency pause and retirement. Any future registry must separate route admission from live liquidity verification and payout custody. A deployed registry alone would not prove that a route was activated or that a payment completed.

## 8. Security and privacy boundaries

The native-credit contracts enforce approved assets, authorization, slot validity, authenticated funding membership, current roots, amount-commitment binding, nullifier consumption, reserve solvency and proof-bound Memo data. Failed settlement mutations roll back atomically, but the earlier confirmed deposit is a separate transaction. Receiver acceptance, funding confirmation, submission and settlement confirmation are distinct lifecycle observations.

Privacy targets confidential TIN activity and public-observer unlinkability. Wallet funding amounts and endpoints remain public. Token identifiers, roots, nullifiers, successor points, ciphertext, accounts, timing and aggregate totals also remain observable. Sparse funding histories, known epoch amounts, persistent recipient/head material and public registration-owner binding can limit unlinkability. Node access to routes and openings is an intentional trust boundary, and independent cryptographic review is not established by the retained evidence.

Threats include compromised or unavailable services, bad RPC data, stale witnesses, invalid proofs, replay, state races, substituted destinations, insufficient liquidity and source/destination consensus failure. Chain constraints and exact authorization must fail closed; service availability and recovery still determine liveness. Confidential debit, TIN-to-TIN conservation, wallet exit and cross-network delivery require their own reviewed proof and runtime evidence.

## 9. Evidence, implementation status and scope

The November 16 record contains finalized Solana Devnet evidence for two private credits and one complete aggregate-accounting operation. This paper was reconciled to that record and current source; it did not repeat those chain operations or inspect today's deployed state. Build evidence, deployment evidence, payment evidence, owner recovery and production readiness must be reported separately.

TSN remains an experimental first release. Planned low-fee EVM integration and optional verified credentials are future work. The protocol is not described as a regulated financial service or a completed universal network. ZK-PRU is a retired historical experiment; current integrations follow TIP, TSNP, TCAP and GPRU's actual contracts.

## References

- [Canonical implementation map](./laboratory/architecture-map.md)
- [Native private-credit ABI and accounting](./laboratory/credit-abi.md)
- [Cryptographic mechanisms and privacy boundaries](./laboratory/cryptography.md)
- [November 16 private-credit and epoch evidence](./laboratory/experiments/EXP-20261116-private-credit-epoch.md)
- [TSN SDK credit implementation](../tsn-protocol/sdks/tsn-sdk/src/tcap-gpru-credit.ts)
- [Solana documentation](https://solana.com/docs)
- [Base documentation](https://docs.base.org/)
- [Arbitrum documentation](https://docs.arbitrum.io/)
- [Polygon documentation](https://docs.polygon.technology/)
