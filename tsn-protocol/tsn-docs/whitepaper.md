# Transfer Settlement Network (TSN)

### An Identity-First, Intent-Based Settlement Protocol

**Version 1.0 — Draft** · **August 2026**

> **Status conventions used throughout this document:**
>
> - ✅ **Implemented** — deployed or present in the current codebase
> - 🔷 **Designed / Proposed** — architecture specified, not yet shipped
> - ⭕ **Roadmap** — planned, not yet designed in full
>
> This whitepaper distinguishes these explicitly. No proposed functionality is presented as implemented.

---

## Abstract

Transfer Settlement Network (TSN) is an identity-first, intent-based settlement protocol for stablecoin payments. It separates _who is authorized to pay_ (identity) from _what is being settled_ (the intent and its bindings) and from _who physically submits the transaction_ (transport). This separation means settlement correctness is enforced cryptographically on-chain, while the parties that move transactions around cannot alter the economic terms.

TSN introduces a privacy-preserving identity model built on Transfer Identity Numbers (TIN), non-custodial routing (GPRU), and confidential asset state (TCap). It targets the two structural gaps in current payment rails: (1) on-chain settlement that exposes amounts, addresses, and the transaction graph; and (2) cross-chain settlement that depends on trusted bridges. TSN's design addresses the first with a progressive privacy roadmap and the second with a cross-domain settlement architecture built on Creditcoin's Attestcoin Protocol — a decentralized oracle that verifies cross-chain facts without a trusted operator.

---

## 1. Introduction

### 1.1 The problem

Stablecoin payments have reached meaningful scale, but the underlying settlement rails carry three structural weaknesses inherited from public ledgers:

1. **Address-based identity.** Wallets are public keys, not identities. There is no protocol-level notion of "who" is authorized to pay, only "which key signed." This makes compliance, authorization, and recovery awkward and drives institutions away.

2. **Total transparency.** Every transfer exposes the sender, recipient, amount, and the accumulating transaction graph to any observer. For individuals this is a surveillance problem; for businesses it is a confidentiality problem that prevents on-chain settlement of payroll, supplier payments, and treasury operations.

3. **Trusted cross-chain bridging.** Moving value between chains today relies on custodial bridges and centralized oracles — single points of failure that have repeatedly lost funds. There is no native, trustless way for a settlement on one chain to be verified and acted upon on another.

### 1.2 The thesis

TSN's thesis is that settlement should be **identity-first** (authorized by a protocol-level identity, not a bare key), **intent-based** (the user declares the settlement they want and the bindings that constrain it), and **privacy-preserving** (identity, amount, and graph are not public). The correctness of settlement must never depend on the honesty of the parties that transport transactions.

### 1.3 Contributions

- A **separation of concerns** — verification, authorization, transport, submission, and settlement are distinct roles with distinct trust.
- **TIN / TIP identity** — a privacy-preserving identity layer abstracting real identity from addresses.
- **Intent + binding enforcement** — settlement DNA, permits, nullifiers, and claim slots that make tampering and replay cryptographically impossible.
- A **cross-domain settlement architecture** built on Attestcoin, which verifies source-chain facts without a trusted bridge.
- A **progressive privacy roadmap** spanning amount privacy (Confidential Token Extensions) to full confidential settlement (MPC).

---

## 2. System Overview

TSN operates on Solana as the settlement and authorization domain. The protocol is organized into five layers with distinct responsibilities:

```
Identity Layer   TIN · TIP · TIN registrar
      │
Intent Layer     signed payment intents (off-chain)
      │
Authorization    Mother Escrow · permit signer · settlement DNA
      │
Transport        Receiver · Node · Cranker
      │
Settlement       Epoch Treasury · payout · TCAP credit
```

The defining property of the architecture is that **transport does not authorize, and authorization does not require transport to be honest.** A compromised Receiver, Node, or Cranker can delay, censor, or reorder work, but it cannot manufacture a valid authorized settlement without also compromising an on-chain authority, a configured permit signer, or the relevant source-chain program state.

---

## 3. Identity Layer — TIN & TIP ✅

### 3.1 Transfer Identity Number (TIN)

A TIN is a human-meaningful payment identity that is resolved privately and never appears on-chain in plaintext. It abstracts the relationship between a real-world identity and blockchain addresses, so that settlement is authorized by _identity_ rather than by a bare key.

### 3.2 Transfer Identity Protocol (TIP)

TIP represents a private transfer identity relationship — the cryptographically bound link between a TIN and its settlement context. TIP state is maintained as a private commitment, so the identity graph is not reconstructable from on-chain data.

### 3.3 Non-custodial routing (GPRU / PRU)

The GPRU/PRU route layer controls private routing and device access without taking custody of funds. Routing metadata is kept off-chain; the chain only ever sees commitments.

**Status:** these primitives are part of the current architecture. Identity resolution and routing are off-chain; only commitments and derived PDAs touch the chain.

---

## 4. Intent & Authorization Layer ✅

### 4.1 Payment intents

A user creates a signed payment intent containing authorization information. Intents are validated and coordinated by TSN Nodes off-chain, so intent content is not publicly visible. The intent binds the economic meaning of a settlement: recipient, amount, asset, nonce, and validity window.

### 4.2 Mother Escrow

Mother Escrow is the root TSN authority and epoch controller. It authorizes intent acceptance and settlement DNA. Mother Escrow itself is a Program-Derived Address (PDA) whose stored `authority` is a governed external keypair. The PDA cannot sign arbitrary messages; the external authority key can.

### 4.3 The permit signer

Private-settlement payouts are authorized by a configured permit signer using domain-separated Ed25519 message templates (`TSN_PRIVATE_SLOT_SETTLEMENT_V1`, `TSN_PRIVATE_SLOT_REFUND_V1`). The permit message binds program, Mother, operator, treasury, claim slot, commitment, nullifier, recipient, mint, amount, fee, lease, and expiry. The signer is governance-rotatable and signs only these templates, never arbitrary messages.

### 4.4 Settlement DNA

Settlement DNA binds payout parameters (recipient, amount, mint, nonce, digest, expiry) to an opaque slot. A Cranker cannot alter these fields: they are checked against stored state, signed messages, and program-derived constraints.

### 4.5 Replay protection

Nullifiers, receipts, and claim slots provide one-time state consumption. A settlement authorization can be executed exactly once; re-execution is rejected on-chain.

### 4.6 Epoch Treasury

The Epoch Treasury holds epoch-level source liquidity and liabilities, with treasury and vault accounting separating funds from pending obligations.

---

## 5. Transport Layer ✅

### 5.1 Node

The Node is a stateless off-chain verifier. It verifies canonical route messages, Ed25519 route/device/wallet signatures, device key fingerprints, expiration, nonces, and commitment field structure. The Node has **no signing authority** — it cannot sign as Mother, as the permit signer, or as TCAP governance, and cannot alter finalized on-chain state. Node attestations are off-chain evidence, not a quorum protocol.

### 5.2 Receiver

The Receiver is durable infrastructure for work state: it stores and leases work, authenticates Crankers, enforces state versions, and provides wake notifications. It does not create authorization.

### 5.3 Cranker

The Cranker transports the exact authorized transaction and pays fees. On-chain, the Cranker cannot change the recipient, mint, amount, settlement commitment, nonce, nullifier, or settlement DNA. It is trusted only for liveness and correct submission — never for settlement semantics.

---

## 6. Cross-Chain Settlement 🔷 Designed / Proposed

TSN's cross-domain design uses **Creditcoin's Attestcoin Protocol** to verify a source-chain settlement fact and settle on Creditcoin without a trusted bridge.

### 6.1 Attestcoin Protocol (verified)

Attestcoin (formerly Universal Smart Contracts / USC) is Creditcoin's native decentralized oracle. It has two halves:

- **Readability (✅ live):** Creditcoin contracts verify facts from source chains. The **Block Prover precompile (`0x0FD2`)** verifies transaction inclusion (Merkle proof) and block continuity (continuity proof) synchronously, within a single Creditcoin block (~15s). The precompile verifies _inclusion_, not success — the consuming contract must check the transaction `status == 0x1`.
- **Writability (⭕ in development):** Creditcoin contracts send messages to destination chains. Not yet available on testnet.

**Verified constraint:** Readability currently supports **EVM source chains only** (Ethereum Mainnet, Ethereum Sepolia). Solana is not yet a supported source chain. This is a documented roadmap item ("eventual goal to enable data provisioning from any chain"), not a current capability.

### 6.2 The SettlementDomain model

TSN abstracts the cross-domain hop so that the settlement engine is domain-agnostic:

```
SettlementDomain: Solana     — source of funds + TSN authorization
SettlementDomain Adapter     — EVM proof surface (Sepolia today)
Attestcoin                   — verifies the published fact
SettlementDomain: Creditcoin — destination settlement
```

The Creditcoin-side contract consumes `(chainKey, headerNumber, txBytes, merkleProof, continuityProof)`, verifies via `0x0FD2`, checks `status == 0x1`, decodes the attested event, re-validates every settlement field, and consumes a destination nullifier. The source chain is a runtime parameter — adding Solana later (when Attestcoin supports non-EVM) requires a new adapter, not a rewrite.

### 6.3 The commitment signer 🔷

The EVM commitment must be authorized by a **portable, EVM-verifiable signature**. Because Solana is Ed25519-native and the EVM has no Ed25519 precompile, TSN introduces a **purpose-isolated secp256k1 commitment signer registered under Mother/governance control**. This is an explicit, governable trust root — not the Node, and not a reuse of the Ed25519 permit signer.

### 6.4 Custody model — correspondent settlement, not a bridge

- **Source funds** remain in the Solana Epoch Treasury. Nothing moves to Ethereum.
- **Destination liquidity** is a Creditcoin pool that advances funds against the verified source obligation.
- **Attestcoin transports no funds** — it verifies facts only.

This is _cryptographically authorized destination-side liquidity against a source-side obligation_ — correspondent/prefunded settlement, **not** an atomic bridge.

---

## 7. Privacy Model

### 7.1 What TSN protects today ✅

| Data                     | Protected | Mechanism                |
| ------------------------ | --------- | ------------------------ |
| Real-world identity      | ✅        | TIN abstraction          |
| Intent content           | ✅        | Off-chain intents        |
| Confidential asset state | ✅        | TCap encrypted snapshots |
| Routing metadata         | ✅        | GPRU/PRU, off-chain      |

### 7.2 The remaining gap

The final on-chain payout currently exposes the sender wallet, recipient wallet, transfer amount, and settlement graph. This is the single remaining exposure.

### 7.3 Progressive privacy roadmap

| Mode                                                | Hides                                          | Status                                      |
| --------------------------------------------------- | ---------------------------------------------- | ------------------------------------------- |
| **Public** (current)                                | —                                              | ✅                                          |
| **Confidential Token Extensions**                   | amounts, balances                              | ✅ deployable                               |
| **MPC confidential settlement** (Arcium CSPL / MXE) | amounts, parties, graph                        | ⭕ mainnet alpha — validate before building |
| **Helius Privacy** (Rings)                          | amounts, parties, graph + selective disclosure | ⭕ private beta — future                    |

The privacy layers are **optional modes** — they wrap observation, never authorization. Mother authority, amount binding, nullifiers, and tip sequence are unchanged regardless of the privacy mode selected.

---

## 8. Security Model

### 8.1 Trust model

**Trusted (cryptographically or by governance):** Mother authority · permit signer · the secp256k1 commitment signer (cross-domain only) · Attestcoin attestor quorum · Creditcoin Block Prover.

**Untrusted / constrained:** Node · Receiver · Cranker · relay. These can delay, censor, or corrupt messages but cannot alter settlement semantics.

### 8.2 Core security property

> A compromised Receiver, Node, Cranker, or relay cannot manufacture a valid authorized settlement unless it also compromises an on-chain authority, a configured permit signer, the relevant source-chain program state, or the destination-chain verification assumptions.

### 8.3 Key threats addressed

| Threat                     | Defense                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------- |
| Malicious Node             | No signing authority; on-chain Mother/TCAP/permit remain required                       |
| Malicious Cranker          | Cannot change recipient/amount/mint/commitment; DNA + permit + claim slot               |
| Replay                     | Nullifiers, receipts, claim slots, nonce (Solana) + destination nullifier (cross-chain) |
| Forged/tampered proof      | Block Prover `0x0FD2` Merkle + continuity verification                                  |
| Wrong destination / amount | Settlement DNA binding + Creditcoin field-equality checks                               |
| Expired settlement         | validity window checks on both domains                                                  |
| Attestor collusion         | BLS quorum + slashing (Attestcoin)                                                      |

### 8.4 Known gaps (disclosed)

- `AcceptedIntentV1` is not directly linked to `EpochTreasury` funding (🔷 to fix).
- Cross-domain replay protection and reconciliation are specified but not yet implemented (🔷).
- The EVM commitment signer is a new trust root; production should upgrade to threshold/t-of-n (⭕).

---

## 9. Economic Model — TCap ✅ (partial)

TCap (Transfer Credit Authorization Protocol) provides confidential asset state: TIP credit advances a private balance commitment, and encrypted snapshots keep balances private. TCAP governance controls accepted assets and policies; TSN-to-TCAP authorization is constrained to the approved TSN program identity.

**Disclosure:** full tokenomics and incentive design will be published separately. This whitepaper does not specify token distribution, emission, or fee schedules.

---

## 10. Conclusion

TSN's contribution is a settlement protocol where **identity, authorization, and transport are separated**, so that correctness is enforced cryptographically while the parties that move transactions cannot redefine the settlement. The architecture already provides identity abstraction (TIN/TIP), non-custodial routing (GPRU), authority-bound acceptance (Mother), permit-signed payouts, settlement DNA, and replay protection. The next phases — cross-domain settlement via Attestcoin and progressive confidential settlement — are designed to extend the same property across chains and across privacy levels, without ever reintroducing a trusted intermediary.

---

## Appendix — Terminology

| Term                    | Definition                                                     |
| ----------------------- | -------------------------------------------------------------- |
| TIN                     | Transfer Identity Number — privacy-preserving payment identity |
| TIP                     | Transfer Identity Protocol — private identity relationship     |
| GPRU / PRU              | Non-custodial routing layer                                    |
| Mother Escrow           | Root TSN authority + epoch controller                          |
| Settlement DNA          | Binds payout parameters to a slot                              |
| Nullifier / claim slot  | One-time consumption (anti-replay)                             |
| Cranker                 | Transport + fee payer (no settlement authority)                |
| TCap                    | Confidential asset state + credit authorization                |
| Attestcoin Protocol     | Creditcoin decentralized oracle (readability + writability)    |
| Block Prover (`0x0FD2`) | Synchronous cross-chain proof verification precompile          |
| SettlementDomain        | Chain-agnostic settlement abstraction                          |

_This whitepaper reflects the current state of the TSN architecture. ✅ = implemented, 🔷 = designed, ⭕ = roadmap._
