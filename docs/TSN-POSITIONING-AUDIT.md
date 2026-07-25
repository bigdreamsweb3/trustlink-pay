# TSN Positioning Audit

## Terminology alignment note (2026-07-23)

This audit records historical documentation findings. The canonical architecture is now **TSN → TIN + TCAP + ZK-PRU + settlement/Cranker coordination**. ZK-PRU is the active privacy-authorization and purpose-bound protected-receiving component within TSN, not future work or a separate product. Any standalone `PRU`, “Privacy Receiving Unit,” or node-owned PRU-secret wording below is historical text being tracked for cleanup. Internal SDK, account, and file identifiers containing `pru` remain compatibility names for ZK-PRU handles and must not be read as a separate protocol.

> Repository-wide documentation and terminology audit against the canonical TSN positioning defined March 2026.
> Date: 2026-07-23
> Auditor: opencode

---

## Summary

The repository contains approximately 60 documentation files plus READMEs, frontend UI strings, SDK comments, blog templates, and code comments. The majority of the protocol-level documentation uses outdated "layers" framing and presents TIP, TSN, TCAP, and ZK-PRU as separate/parallel products rather than internal components of TSN. The tsn-protocol/README.md and ARCHITECTURE.md are the most severely affected files.

---

## Classification of Violations

| Code | Description |
|------|-------------|
| V1   | Presents TIN, TSN, TCAP, ZK-PRU as unrelated/parallel products or "layers" |
| V2   | Describes TSN mainly as wallet-to-wallet settlement |
| V3   | Implies complete TSN experience without a TIN |
| V4   | Claims complete ZK privacy where only node-assisted routing exists |
| V5   | Describes TCAP as network coordinator instead of TSN's confidential asset infrastructure |
| V6   | Says Crankers provide liquidity or custody funds |
| V7   | Exposes recipient wallet addresses as normal TIN payment experience |
| V8   | Treats public-wallet compatibility as main architecture |

---

## Files Inspected and Findings

### Root README.md (root/)

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 19-24 | Architecture table: TIP, TSN, TCAP, ZK-PRU as separate rows under "Architecture" heading, describing ZK-PRU as "Separate zero-knowledge privacy technology under development" | V1 | Restructure as TSN components, not separate architecture layers. ZK-PRU is an internal future component of TSN. |

Also on line 24: `ZK-PRU | Separate zero-knowledge privacy technology under development; not a TCAP submodule` — This correctly says "not a TCAP submodule" but still frames it as an independent architecture row rather than a TSN internal component. **Change**: documentation-only.

---

### docs/ARCHITECTURE.md (docs/)

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 3 | "TrustLink Pay is a Web3 payment system with one user-facing product surface and several protocol layers." | V1 | Layers framing is acceptable if TSN is the encompassing protocol, but "protocol layers" implies separate products. |
| 13-17 | Numbered list treating TIP, TSN, TCAP, ZK-PRU as 4 independent items. | V1 | Restructure: 1. TrustLink Pay app, 2. TSN (containing TIP identity, PRUs, TCAP confidential assets, settlement coordination, Cranker execution, future ZK-PRU). |
| 29 | "How The Layers Work" heading | V1 | Change to "How The Components Work" or "TSN Protocol Components". |
| 37 | "Identity Layer: TIP" | V1 | Change to "TSN Identity Component: TIP". |
| 56 | "Privacy Layer: PRUs" | V1 | Change to "TSN Receiving Infrastructure: PRUs". |
| 64 | "Settlement Layer: TSN" | V1 | TSN is not a "layer" — it is the network itself. Change to "TSN Settlement Coordination". |
| 68 | "Crankers: Operator Layer" | V1 | Change to "TSN Execution: Crankers". |
| 81 | "Confidential Asset Layer: TCAP" | V1 | Change to "TSN Confidential Asset Infrastructure: TCAP". |
| 102-104 | "ZK-PRU is a separate zero-knowledge privacy technology under development. It is not a TCAP submodule and only verified capabilities should be presented as available." | V1 | ZK-PRU is not "separate" — it is a future TSN internal component. Change to: "ZK-PRU is the future device-side privacy and proof architecture for TSN. It is under development; only verified capabilities should be presented as available." |

All changes: **documentation-only**.

---

### docs/START-HERE.md (docs/)

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 25 | "## The Main Parts" section lists TIP, PRUs, TSN as separate subsections | V1 | Restructure as "Components of the Transfer Settlement Network". |
| 29 | "TIP is the identity layer." | V1 | Change to "TIP is TSN's identity component". |
| 39 | "### TSN" as a separate subsection | V1 | Make clear this is the umbrella heading with TIP, PRU, TCAP, Cranker as sub-components. |

**Change**: documentation-only.

---

### docs/README.md (docs/)

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 3 | "Identity-first Solana payments using Transfer Identity, PRU-routed balances, and the Transfer Settlement Network." | V1 | "Transfer Settlement Network (TSN) — identity-first payments using TIN payment identity, PRU-routed balances, and TSN settlement coordination." |
| 20 | ARCHITECTURE.md described as "How the product, identity, privacy, settlement, and liquidity layers fit together" | V1 | Remove "layers" language. |
| 34 | "### TIP: Transfer Identity Protocol" — separate heading | V1 | Should be under TSN umbrella in structure. |
| 36 | "TIP is the identity layer." | V1 | Change to "TIP is TSN's identity component." |
| 44 | "It is the settlement layer" | V1 | Change to "TSN is the settlement protocol." |
| 56 | "Crankers are settlement operators. They... execute payouts from liquidity vaults." | V6 | Add clarification: "Crankers facilitate settlement payments. Cranker vaults use operator-supplied funds that are reimbursed through epoch settlement; Crankers do not take custody of user funds." |
| 60 | "Liquidity vaults hold funds used for fast recipient payouts." — no violation itself but the document doesn't clarify these are operator-supplied, reimbursed funds | V6 (mild) | Clarify that vaults are reimbursement-based, not custody of user funds. |

**Change**: documentation-only.

---

### docs/TSN.md (docs/)

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 62 | "The LP share remains in the Cranker vault because that vault is the active liquidity vault for the payout." | V6 | Clarify these are operator-supplied vault funds, reimbursed through epoch settlement. Crankers do not hold user funds. |
| 82-86 | Fee distribution showing transfers from Cranker vault to recipient/operator/treasury/reserve | V6 | Needs explicit language that Crankers do not custody user funds; vault funds are settlement-liquidity, not user deposits. |

This document is otherwise well-aligned with TSN positioning. **Change**: documentation-only.

---

### docs/TSN-WHITEPAPER.md (docs/)

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 1 | Title: "The Privacy-First Settlement Layer for Identity-Based Stablecoin Payments" | V1 | Change to "The Identity-First, Privacy-Preserving Settlement Network for Stablecoin Payments" |
| 3 | "The Missing Layer in Blockchain Payments" | V1 | Change to "The Missing Infrastructure in Blockchain Payments" |
| 44 | "It is the settlement layer" | V1 | Change to "It is the settlement protocol" or "network". |
| 60 | "a better abstraction layer" | V1 | Change to "a better abstraction" |
| 64 | "The Transfer Identity Protocol is the identity foundation... It provides a human-friendly identity layer" | V1 | Change to "identity component" |
| 104 | "a controlled identity layer" | V1 | Change to "identity system" |
| 113 | "TIP provides the identity abstraction layer" | V1 | Change to "identity abstraction" |
| 120 | "Identity Layer" diagram label | V1 | Change to "TSN Identity: TIP" |
| 242 | "The 85% LP share remains in the Cranker vault because that vault is the active liquidity vault for the payout." | V6 | Add clarification re: vault liquidity vs user custody. |
| 289 | "Vaults: Liquidity Layer" | V1/V6 | Change to "Vaults: Settlement Liquidity". |
| 293 | "A Cranker can pay the recipient from vault liquidity" | V6 | Add that this is reimbursement-based. |
| 377 | "open settlement layer" | V1 | Change to "open settlement network". |
| 385 | "layers" in reference list | V1 | Clean up. |

**Change**: documentation-only.

---

### docs/PROTOCOL.md (docs/)

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 7 | "set of rules that connect Transfer Identity, TSN settlement, Cranker work, vault liquidity, and epoch accounting" | V1 | Rewrite: "set of rules within the Transfer Settlement Network that connect identity (TIN), receiving infrastructure (PRUs), settlement coordination, Cranker execution, and epoch accounting." |
| 9 | "settlement layer" | V1 | Change to "settlement network". |
| 38 | "coordination layer" | V1 | Change to "coordination system". |
| 66 | "executes recipient payout from vault liquidity" | V6 | Clarify vault liquidity is operator-supplied. |

**Change**: documentation-only.

---

### docs/CRANKER.md (docs/)

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 104 | "Crankers are not banks and should not custody user funds outside the protocol rules." | V6 | This is actually **correct** but weakly stated. Could be strengthened: "Crankers never custody user funds. They pay settlement transaction fees and submit authorized transactions." |

Mostly clean. **No change required** — add canonical phrasing enhancement.

---

### docs/LIQUIDITY.md (docs/)

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 21 | "A valid Cranker pays the recipient from vault liquidity." | V6 | Clarify that vault liquidity is supplied by operators/LPs and reimbursed through epoch settlement; Crankers do not hold user funds. |

The entire LIQUIDITY.md document describes vault liquidity as the payment mechanism. This should be updated to clarify that this is transitional infrastructure, not the final TSN model. **Change**: documentation-only.

---

### tsn-protocol/README.md (tsn-protocol/)

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 5 | "TSN is the settlement protocol... coordinating payment intents, sender-side escrow, recipient payouts, Cranker execution, vault liquidity, commitments, and epoch accounting." | V6 | Remove "vault liquidity" or clarify that Cranker vaults are operator liquidity, not custody. |
| 19-23 | Mermaid diagram showing "B --> D[TIP\nIdentity Layer]", "B --> E[ZK-PRU\nPrivacy Layer]" | V1 | ZK-PRU is not a separate "Privacy Layer" parallel to TIP. It is a future TSN internal component. |
| 28-34 | Core systems table listing TIP, ZK-PRU, TSN Protocol, Crankers, Solana as separate systems | V1 | Restructure: TSN contains TIP (identity), PRU/TCAP (confidential infrastructure), settlement coordination, Cranker network, and future ZK-PRU as internal components. |
| 38-46 | "Four-Layer TrustLink Architecture" with Identity/Verification/Privacy/Settlement/Operators layers | V1 | Remove the four-layer model entirely. TSN is not a stack of layers. |
| 49 | "The Verification Layer is a top-level control function, while Crankers and liquidity providers operate inside the Settlement Layer." | V1/V6 | Rewrite using TSN internal components. |
| 55-59 | "Transfer Identity Protocol... provides the identity layer used by TSN-powered payments." | V1 | Change "layer" to "component". |
| 222 | "A Cranker vault provides recipient-payout liquidity." | V6 | Clarify as operator-supplied reimbursement vault. |
| 246 | "Recipient payouts are funded from Cranker vault liquidity supplied by operators and liquidity providers." | V6 | Needs canonical framing: "Crankers pay settlement transaction fees and submit transactions. Vault liquidity is an operator-facing liquidity mechanism, not user fund custody." |

This file is the **most severely affected**. **Change**: documentation-only but requires a comprehensive rewrite of its "Architecture at a Glance" and "Four-Layer Architecture" sections.

---

### docs/TSN-COMMITMENT-SETTLEMENT.md (docs/)

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 5 | "It is the layer that separates sender funding from recipient payout." | V1 | Change "layer" to "component within TSN". |

**Change**: documentation-only.

---

### docs/TRANSFER-IDENTITY.md (docs/)

Mostly well-aligned internally. However:

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 5 | "identity layer used by TrustLink Pay" | V1 | Change to "TSN identity component used by TrustLink Pay". |
| 128-175 | Multiple uses of "TSN mempool and Cranker layer" | V1 | Replace "layer" with "infrastructure" or "component". |
| 132 | "| Layer | Stores | Mutation rule |" table header | V1 | Change "Layer" to "Component". |
| 242 | "The Transfer Identity program separates identity ownership from PRU spend authority... PRU spend keys come from a random TIN Master Seed generated inside the TSN mempool and Cranker layer." | V1 | Replace final "layer" with "infrastructure". |

**Change**: documentation-only.

---

### ZK-PRU/README.md (ZK-PRU/)

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 3 | "Zero-Knowledge Private Routing Units — a wallet-bound, zero-knowledge identity layer for privacy-preserving protocol participation." | V1, V4 | ZK-PRU is positioned as an independent protocol/product with its own identity layer, not as a future TSN internal component. This is the most severe V1 violation. |
| 5 | Claims ZK-PRU allows users to "never expose their wallet address, signatures, or any recovery secret to the protocols they use." | V4 | This describes the target architecture as if it exists. The repo contains spec/designs, not deployed ZK circuits verified on-chain. |
| 12 | "ZK-PRU breaks that link" — presented as current capability | V4 | The ZK-PRU directory contains design docs, TS SDK scaffold, and circuit definitions. There is no evidence of deployed on-chain verification. |
| 20-22 | "How it works, in one paragraph" — describes full device-seed flow as current | V4 | This describes the target architecture, not current implementation. |
| 26-28 | "The new architecture breaks the signature-theft attack vector" | V4 | Framed as solved problem. |

**Assessment**: ZK-PRU is positioned as a **standalone protocol**, not as a future internal TSN component. The README claims implemented capabilities (ZK proofs, device-side derivation) that are not deployed on-chain anywhere. The ZK-PRU directory should:
1. Be reframed as an internal future component of TSN.
2. Add prominent "DESIGN / TARGET ARCHITECTURE — NOT DEPLOYED" headers.
3. Remove language suggesting the ZK proving system is operational on-chain.

**Change**: technical assumption (changes how external readers perceive deployment status) and documentation-only (no protocol code is changed).

---

### docs/TCAP-SETTLEMENT-AUTHORIZATION.md (docs/)

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 12 | "sender escrow -> Cranker liquidity payout -> reimbursement" | V6 | Clarify final model does not require Cranker liquidity for payout. |

**Change**: documentation-only.

---

### docs/TCAP-PROGRAM-RELOCATION.md (docs/)

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 54 | Mentions "Cranker vault and liquidity instructions" | V6 | Minor; add clarifying language. |

**Change**: documentation-only.

---

### docs/TCAP-PHASE3-STATUS.md (docs/)

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 13 | "Legacy dependency: TSN vault.rs, mother_escrow.rs, Cranker liquidity, reimbursement and payout instructions." | V1, V6 | Clarify that legacy escrow/liquidity is transitional. |

**Change**: documentation-only.

---

### docs/TCAP-MIGRATION-PLAN.md (docs/)

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 14 | "Cranker liquidity" reference | V6 | Clarify as transitional. |

**Change**: documentation-only.

---

### docs/TCAP-TSN-ASSET-MIGRATION.md (docs/)

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 351 | "The two confidentiality layers remain separate" | V1 | Change to "The two confidentiality components within TSN remain separate". |

**Change**: documentation-only.

---

### docs/MENTIONS.md (docs/)

Skimmed — no positioning violations found. Contains community quotes and references.

---

### docs/FAQ.md (docs/)

Not fully reviewed — appears to use mostly correct terminology based on grep results.

---

### docs/DEPLOYMENT.md, docs/INTEGRATION.md, docs/API.md, docs/DEVELOPER.md (docs/)

Technical docs — generally use TSN positioning correctly. Minor "layer" references in DEVELOPER.md. No severe violations.

---

### docs/WINDOWS-TSN-COMMANDS.md, docs/SIGNING.md, docs/RPC-GATEWAY.md, docs/META-DATA-USE-COMPLIANCE.md, docs/EPOCH-SETTLEMENT.md, docs/TSN-DEVICE-AUTHORIZATION.md, docs/TSN-DEVICE-RECOVERY-ARCHITECTURE.md, docs/TSN-HISTORICAL-RECEIPT-RECOVERY.md, docs/TSN-PRIVATE-VIEW-LIT.md, docs/TSN-RECOVERY-UX.md, docs/TSN-TRANSFER-IDENTITY-MEMPOOL.md, docs/TSN-USER-OWNED-PRIVATE-DATA.md, docs/TSN-V1-PRIVACY-AUDIT.md, docs/TSN-V1-PRU-ARCHITECTURE.md (docs/)

Technical/operational docs — no V1/V2/V3/V4/V5/V6/V7/V8 violations found. References to "Cranker layer" or "mempool layer" in TSN-V1-PRU-ARCHITECTURE.md are minor wording issues.

---

### docs/TRANSFER-IDENTITY-OPERATOR.md (docs/)

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 7 | "The Transfer Identity Protocol is the identity layer." | V1 | Change to "identity component within TSN". |

---

### docs/SECURITY.md (docs/)

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 104 | "PRU Security Hardening Layer (2026-06-26)" | V1 | Minor; "Layer" in title. |
| 108 | "five-layer TrustLink-only control plane... generated inside the TSN mempool and Cranker layer" | V1 | Replace "layer" with "component" or "infrastructure". |

**Change**: documentation-only.

---

### docs/SECURITY-PHILOSOPHY.md (docs/)

No V1-V8 violations found. Appropriately conservative about privacy claims.

---

### docs/WHATSAPP-SEAMLESS-PAY.md (docs/)

| Line(s) | Offending Text | Violation | Proposed Correction |
|---------|----------------|-----------|-------------------|
| 3 | "WhatsApp is an optional communication and confidence layer." | V1 | Change "layer" to "channel" or "signal". |

---

### blogger/ pages (blogger/pages/)

| File | Finding |
|------|---------|
| trustlink-pay-ecosystem-partner-brief.html | Clean — correctly positions TSN as the infrastructure, TIN as payment identity. No V1-V8 violations. |
| other pages (about, contact, privacy, editorial) | No TSN positioning claims found. |

---

### blogger/ posts/ and XML themes

Skimmed — technical Blogger templates, no protocol positioning claims that violate the standard.

---

### frontend/ UI strings

| File | Finding |
|------|---------|
| app/(public)/tsn/page.tsx | Uses "TSN coordinators" (line 61) and "TSN does not require a liquidity-provider protocol layer" — mostly correct. Minor "layer" reference on line 63. |
| app/(public)/page.tsx | FAQ: "TSN is the settlement protocol that coordinates private payment execution" — clean. |
| app/(public)/tsn/page.tsx:18 | "vault capital" reference — clarify that these are operator vaults. |
| General frontend strings | **No V1-V8 violations.** UI consistently uses TIN-to-TIN flow, PRU routing, Cranker-sponsored settlement. Correctly shows TIN selection instead of wallet address. |

---

### backend/, packages/, protocol-tests/, protocol-test-runs/, research/

- **backend/README.md**: No positioning violations. Uses technical terminology correctly.
- **packages/**: No positioning violations found.
- **protocol-tests/**: Test names do not claim success of unimplemented ZK features. Uses "node-assisted PRU routing" terminology.
- **protocol-test-runs/**: Logs show devnet transaction activity for TIN registration and TSN settlement using the transitional node-assisted model. No ZK claims.
- **research/**: Research documents appropriately describe future/target architecture.

---

## Violation Summary by Severity

### Critical (V1: separate-products framing)
1. **tsn-protocol/README.md** — "Four-Layer Architecture" diagram and core systems table frame TIP, ZK-PRU, TSN Protocol, Crankers as four separate layers/systems.
2. **ZK-PRU/README.md** — positions ZK-PRU as a standalone zero-knowledge identity protocol, not as a future TSN internal component.
3. **docs/ARCHITECTURE.md** — "The Main Parts" numbered list treats TIP, TSN, TCAP, ZK-PRU as 4 independent items; six "Layer" subsections.

### High (V6: Cranker liquidity/custody)
1. **tsn-protocol/README.md** — "Cranker vault provides recipient-payout liquidity" and "liquidity providers operate inside the Settlement Layer."
2. **docs/WHITEPAPER.md** — Multiple references to Cranker vault liquidity and LP share remaining in the vault.
3. **docs/LIQUIDITY.md** — Describes vault liquidity as payout mechanism without clarifying transitional nature.
4. **docs/TSN.md** — Fee distribution section implies Cranker vault holds funds, needs canonical clarification.

### Medium (V1: "layer" terminology throughout)
- ~50+ references to TIP, TSN, PRUs, TCAP, ZK-PRU as "layers" across all main documentation files. These need consistent replacement with "component" or "infrastructure."

### Low (V4: ZK privacy claims)
- **ZK-PRU/README.md** — Describes target ZK architecture as implemented capability. No deployed ZK verification exists on-chain.

---

## Conflicts Between Documentation and Source Code

1. **Vault liquidity model**: Documentation describes Cranker vaults as holding liquidity for payouts. Source code (tsn-protocol/tsn-cranker-op-daemon/) shows a reimbursement model where Cranker-supplied funds are used for payout then settled through epoch recovery. The docs need to catch up to the source to clarify this is operator liquidity, not custody.

2. **ZK-PRU deployment**: ZK-PRU/README.md and docs describe zero-knowledge proving as architecturally solved. Source code shows only design docs, a TypeScript SDK scaffold, and circuit definitions. No deployed on-chain verifier exists.

3. **TCAP status**: docs/TCAP-IMPLEMENTATION-STATUS.md claims Phase 1 (reserve) and Phase 2 (funding claims). Source confirms this. However, docs do not clearly state that TCAP is TSN's confidential asset infrastructure (they frame it as a separate "layer").

---

## Current Implementation vs Target Architecture

| Aspect | Current (Transitional) | Target |
|--------|----------------------|--------|
| PRU route resolution | Node-assisted: mempool decrypts TIN Master Seed, derives PRU keys, releases worker permit | Device-side: user authorizes route locally, device generates proof |
| Privacy model | Transaction separation, SHA-256 destination hashes, node-assisted route decryption | Full ZK proofs, no node sees private routing material |
| Cranker role | Validates, escrows, pays from vault liquidity, gets reimbursed | Pays tx fees, submits authorized settlement txs |
| TCAP | Reserve deposits and Funding Claims only (Phase 1-2) | Full confidential asset ownership, nullifiers, atomic ownership transitions |
| ZK-PRU | Design docs and TS scaffold only | Deployed proving and verification |

---

## Unresolved Terminology Requiring Founder Approval

1. **"Layer" vs "Component" vs "Infrastructure"**: Every current "layer" reference needs replacement. Founder should confirm the canonical term.
2. **"Transfer Settlement Network" vs "TSN Protocol"**: Some docs use "TSN Protocol" (the SDK), others use "TSN" (the whole network). Founder should confirm whether TSN Protocol (the settlement coordination component) should be renamed to reduce confusion with TSN (the entire network).
3. **Cranker vault liquidity**: The documentation describes Crankers as executing payouts from vault liquidity. The canonical positioning says Crankers "pay transaction fees and submit authorized settlement transactions without taking custody of user funds." If vault liquidity is purely operator-supplied reimbursement liquidity, this needs to be explicitly stated everywhere. If there is any non-operator vault liquidity model, founder must clarify.
4. **ZK-PRU as a separate repository**: Currently at root/ZK-PRU/ as a nearly-independent codebase with its own package.json, circuits, SDK, and tests. Founder must decide whether this should be merged into tsn-protocol/ or remain separate with clear TSN-component framing.
5. **"Privacy Layer" terminology**: Currently used in ARCHITECTURE.md, tsn-protocol/README.md, and TRANSFER-IDENTITY.md to describe PRUs. Privacy in TSN is achieved through the combination of TIN identity, PRU infrastructure, TCAP confidential assets, and future ZK-PRU — not a single "layer."
