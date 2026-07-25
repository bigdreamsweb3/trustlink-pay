# TSN Implementation Gap Map

> Maps every stage of the desired native TIN-to-TIN payment flow to actual source code and deployment evidence.
> Date: 2026-07-23
> Rule: Do not infer success from documentation, IDLs, or source code alone. Only confirmed on-chain transactions count as DEVNET_VERIFIED.

---

## Deployment Summary (from verified on-chain evidence)

| Program | Devnet ID | Status | Last Evidence |
|---------|-----------|--------|---------------|
| Transfer Identity (TIP) | `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` | EXECUTABLE on devnet | 2026-07-22 test run |
| TSN (TrustLink Escrow) | `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V` | EXECUTABLE on devnet | 2026-07-22 test run |
| TCAP | `TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x` | EXECUTABLE on devnet | 2026-07-22 test run |

**No confirmed successful end-to-end TIN-to-TIN payment transaction exists on devnet.**

---

## Flow Stage Map

### 1. TIN Registration

| Aspect | Detail |
|--------|--------|
| **Source** | `transfer-identity-protocol/tin-registrar/program/src/processor/create_tin.rs` — instruction `tin_creation_registry` |
| **SDK** | `transfer-identity-protocol/tip-sdk/` — TIN creation frontend flow |
| **Mempool** | `tsn-protocol/tsn-sdk/src/mempool.ts` — TIN creation fee commitment, mempool routing |
| **Deployment** | Program `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` is EXECUTABLE on devnet |
| **Anchor config** | `transfer-identity-protocol/tin-registrar/program/Anchor.toml` — `programs.devnet.tins_program` |
| **Test evidence** | Multiple `pids/` keypairs exist. No confirmed successful `tin_creation_registry` transaction found in test-run logs. Test runs were blocked by missing test wallet. |

**Status: DEPLOYED** — Program is deployed and executable on devnet. Source code for TIN registration is complete. However, **no confirmed successful on-chain TIN creation transaction has been evidenced** in the available test-run artifacts.

**Blocked by:** Missing devnet test wallet with SOL (`trustlink-devnet-test.json`).

---

### 2. ZK-PRU Protected Receiving Route

| Aspect | Detail |
|--------|--------|
| **ZK-PRU derivation** | `tsn-protocol/tsn-sdk/src/pru.ts` — compatibility API for device-side ZK-PRU handle derivation |
| **Route auth** | `tsn-protocol/tsn-sdk/src/pru-route-auth.ts` — authenticated route sessions |
| **ZK-PRU spend guard** | `tsn-protocol/tsn/program/.../state/pru.rs` — `PruSpendGuard` on-chain account |
| **ZK-PRU denomination** | `tsn-protocol/tsn-sdk/src/pru-denomination.ts` — ZK-PRU balance planning |
| **Device boundary** | ZK-PRU root material is decrypted only on the user's device; infrastructure receives authorized commitments or proofs |
| **On-chain state** | `tsn-protocol/tsn/program/.../state/pru.rs` — `PruSpendGuard` per ZK-PRU handle with nonce bitmask, spend auth hash |
| **Mempool** | `tsn-protocol/tsn-mempool-backend/` — route authorization session management |
| **Privacy model** | **ZK-PRU authorization boundary**: encrypted root material stays user-controlled; runtime deployment evidence is tracked separately. |

**Status: PARTIAL** — ZK-PRU compatibility infrastructure exists in the TSN program (Rust) and SDK (TypeScript). Route authentication with session tokens is implemented. The spend guard account exists. However, the end-to-end flow (device initialization → handle authorization → on-chain guard creation → route authorization → spend) has not been confirmed via a successful devnet transaction.

**Key gap**: Runtime deployment and Devnet confirmation of the ZK-PRU verifier/authorization path remain to be evidenced; source and SDK presence alone are not proof.

---

### 3. Sender Authorization

| Aspect | Detail |
|--------|--------|
| **TSN payment intent signing** | `tsn-protocol/tsn-sdk/src/sponsored-settlement.ts` — sender co-signs Cranker-sponsored settlement |
| **Authorization message** | `tsn-protocol/tsn-sdk/src/canonical-message.ts` — canonical TSN payment message format |
| **Payment auth** | `tsn-protocol/tsn-sdk/src/payment-authorization.ts` — sender authorization building |
| **Send estimate** | `tsn-protocol/tsn-sdk/src/send-estimate.ts` — fee estimation before signing |
| **Frontend** | `frontend/src/components/experiences/send-experience.tsx` — TIN input, route resolution, auth signing |
| **Privacy level selection** | `tsn-protocol/tsn-sdk/src/tin-balance-spend-planner.ts` — determines ZK-PRU-only vs mixed vs wallet-only |

**Status: IMPLEMENTED_IN_SOURCE** — The SDK and frontend have full sender authorization flow. The sender selects recipient TIN, resolves PRU route, signs a canonical TSN payment message. The frontend correctly uses TIN-to-TIN flow (not wallet-to-wallet). 

**Has not been verified on devnet** as end-to-end due to downstream stage blockers.

---

### 4. TCAP Funding or Confidential Spend

| Aspect | Detail |
|--------|--------|
| **TCAP program** | Deployed at `TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x` — EXECUTABLE |
| **Phase 1: Reserve** | `deposit_with_funding_commitment_v1` — implemented in source, attempted on-chain 2026-07-22, **FAILED** (`FundingCommitmentMismatch` error) |
| **Phase 2: Funding Claims** | Implemented in source. Blocked by Phase 1 success. |
| **Instructions available in IDL** | 12 instructions including `initialize_*`, asset management, TSN authorization registration |
| **TSN authorization prep** | `tsn-protocol/tsn/program/.../instructions/prepare_tcap_authorization.rs` — links TSN intent to TCAP authorization |
| **Phase 3+** | `settle_funding_to_confidential_owner_v1`, `settle_funding_to_public_exit_v1`, `settle_confidential_transfer_v1` — **NOT_IMPLEMENTED** |
| **Phase 3+ accounts** | `ConfidentialAssetContainerV1`, `PublicExitAuthorizationV1` — **NOT_PRESENT** in source |

**Status: PARTIAL (Phase 1-2 source exists), DEPLOYED (program executable), FAILED (last on-chain attempt rejected), NOT_IMPLEMENTED (Phases 3+).**

**Critical blocking error**: `FundingCommitmentMismatch` — the client commitment derivation does not match on-chain authorization state. This must be resolved before any TCAP funding flow can proceed.

---

### 5. TSN Payment Intent

| Aspect | Detail |
|--------|--------|
| **On-chain instruction** | `tsn-protocol/tsn/program/.../instructions/create_intent.rs` — `CreateIntent` instruction |
| **Intent processing** | `tsn-protocol/tsn/program/.../instructions/process_payment_intent.rs` — validates and processes |
| **Intent finalization** | `tsn-protocol/tsn/program/.../instructions/finalize_payment_intent.rs` — completes intent lifecycle |
| **SDK** | `tsn-protocol/tsn-sdk/src/payment-jobs.ts` — intent creation and monitoring |
| **On-chain state** | `tsn-protocol/tsn/program/.../state/intent.rs` — `PaymentIntent` account (status, amount, token, destination hash, nonce, expiry) |
| **Deployment** | Program `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V` is EXECUTABLE on devnet |

**Status: DEPLOYED** — Program executable on devnet. Source code for intent creation, processing, and finalization exists. However, no confirmed successful `create_intent` transaction was found in test-run logs (downstream of TIN registration and TCAP funding prerequisites).

---

### 6. Cranker Execution

| Aspect | Detail |
|--------|--------|
| **Cranker registration** | `src/tsn/instructions/register_cranker.rs` — registers operator |
| **ZK-PRU spend execution** | `src/tsn/instructions/execute_pru_spend.rs` — moves funds from ZK-PRU into private escrow |
| **Private payout** | `src/tsn/instructions/execute_private_payout.rs` — pays recipient ZK-PRU handle from escrow |
| **Vault payout** | `src/tsn/instructions/execute_vault_payout.rs` — legacy vault payout path |
| **Fee distribution** | `src/tsn/utils/fee_math.rs` — fee split calculation |
| **Cranker op daemon** | `tsn-protocol/tsn-cranker-op-daemon/` — TypeScript reference operator |
| **Cranker SDK** | `tsn-protocol/tsn-cranker-sdk/` — operator tooling |
| **Vault instructions** | `initialize_cranker_vault.rs`, `fund_cranker.rs`, `withdraw_cranker_funds.rs` — legacy vault liquidity path |
| **Current model** | Cranker validates intent, pays tx fees, submits settlement. Vault liquidity is an operator-supplied reimbursement mechanism. |

**Status: PARTIAL** — Full Cranker instruction set exists in source (execute_pru_spend, execute_private_payout, fee distribution). Cranker daemon and SDK exist. BUT:
- PRU spend execution depends on TCAP funding which has failed on-chain.
- Vault payout is the legacy path (being phased out for TCAP).
- No confirmed successful Cranker settlement transaction on devnet.

---

### 7. TCAP Authorization Consumption

| Aspect | Detail |
|--------|--------|
| **Source** | TCAP's `settle_funding_to_confidential_owner_v1` — **NOT_IMPLEMENTED** |
| **Source** | TCAP's `settle_confidential_transfer_v1` — **NOT_IMPLEMENTED** |
| **Nullifier consumption** | TCAP nullifier registry exists. Nullifier consumption not implemented. |
| **TSN→TCAP linkage** | `prepare_tcap_authorization.rs` exists (prepares TSN intent for TCAP settlement). Consume side missing. |

**Status: NOT_IMPLEMENTED** — TCAP authorization consumption (moving from TSN settlement intent into TCAP confidential ownership) has no implemented instructions. This is the full gap between Phase 2 (funding claims) and Phase 3 (confidential asset ownership).

---

### 8. Recipient Confidential Ownership

| Aspect | Detail |
|--------|--------|
| **Confidential Asset Container** | TCAP account type `ConfidentialAssetContainerV1` — **NOT_PRESENT** in any source |
| **ZK-PRU receiving** | Recipient receives via ZK-PRU token accounts (current transitional model) |
| **TCAP ownership** | No mechanism for recipient to hold TCAP-backed confidential ownership |
| **Private settlement** | `configure_private_settlement.rs` — configures private settlement parameters for a TIN |

**Status: NOT_IMPLEMENTED** — The recipient receives funds through PRU token accounts (standard SPL Token accounts) in the current model, not through TCAP confidential asset containers. TCAP confidential ownership is target architecture only.

---

### 9. Receipt and Finality

| Aspect | Detail |
|--------|--------|
| **TSN receipt SDK** | `tsn-protocol/tsn-sdk/src/receipts/` — receipt generation and verification |
| **Settlement proof** | `src/tsn/instructions/submit_proof.rs` — submits settlement proof on-chain |
| **Private commitment** | `src/tsn/instructions/register_private_commitment.rs` — registers private settlement commitment |
| **Epoch settlement** | `src/tsn/instructions/settle_epoch.rs`, `epoch_settlement.rs` — epoch recording |
| **Claim** | `src/tsn/instructions/claim_intent.rs` — claim settled intent |

**Status: IMPLEMENTED_IN_SOURCE** — Receipt infrastructure exists in SDK and on-chain program instructions. However, these cannot be verified on devnet until upstream stages succeed.

---

## Summary Status Table

| Stage | Source Code | Build Artifacts | Devnet Deployed | Devnet Verified |
|-------|-------------|-----------------|-----------------|-----------------|
| 1. TIN registration | IMPLEMENTED | BUILT | DEPLOYED | NOT_VERIFIED |
| 2. Protected ZK-PRU route | PARTIAL | BUILT | DEPLOYED | NOT_VERIFIED |
| 3. Sender authorization | IMPLEMENTED | BUILT | (client-side) | NOT_VERIFIED |
| 4. TCAP funding | PARTIAL (Ph1-2) | BUILT | DEPLOYED | FAILED |
| 5. TSN payment intent | IMPLEMENTED | BUILT | DEPLOYED | NOT_VERIFIED |
| 6. Cranker execution | PARTIAL | BUILT | DEPLOYED | NOT_VERIFIED |
| 7. TCAP auth consumption | NOT_IMPLEMENTED | — | NOT_DEPLOYED | — |
| 8. Recipient conf. ownership | NOT_IMPLEMENTED | — | NOT_DEPLOYED | — |
| 9. Receipt and finality | IMPLEMENTED | BUILT | DEPLOYED | NOT_VERIFIED |

---

## Critical Blockers

1. **Missing devnet test wallet** — All test runs blocked at `ENOENT: /home/bigdream/.config/solana/trustlink-devnet-test.json`. No end-to-end flow can execute without this.

2. **TCAP `FundingCommitmentMismatch` (Error 0x1786)** — The only instruction that reached devnet execution was rejected. Commitment derivation logic between client and on-chain program is inconsistent.

3. **No TIN registration on devnet** — Even though TIP program is deployed, no confirmed TIN creation transaction has succeeded.

4. **ZK-PRU proving system** — Zero-knowledge circuits exist as designs and TypeScript scaffold only. No deployed on-chain verifier. This is target architecture, not current.

---

## Gap Between Current and Target Architecture

| Flow Aspect | Current (Transitional) | Target |
|-------------|----------------------|--------|
| ZK-PRU derivation | Mempool decrypts TIN Master Seed, derives keys | Device-side derivation, ZK proof of ownership |
| Route resolution | Node-assisted (mempool backend) | Device-side private route resolution |
| Sender identity | TIN + wallet co-sign | TIN-only (wallet as recovery/ownership anchor) |
| Funding source | ZK-PRU token accounts (SPL Token) + optional wallet top-up | TCAP confidential asset containers |
| Settlement | Cranker validates, pays fees, executes on-chain | Cranker submits ZK proofs only; no on-chain fund movement |
| Recipient ownership | SPL Token account per ZK-PRU handle | TCAP confidential ownership container |
| Cranker vault | Operator-supplied liquidity (reimbursement-based) | Not required; Cranker only pays submission fees |
| Proof system | On-chain escrow + vault + commitment accounts | Minimal on-chain; ZK proofs for settlement verification |

---

## Immediate Action Items (ordered)

1. **Resolve devnet test wallet** — Create/fund `trustlink-devnet-test.json` to enable test transactions.
2. **Fix TCAP `FundingCommitmentMismatch`** — Debug and align client-side commitment derivation with on-chain validation.
3. **Confirm TIN registration** on devnet — Deploy a successful `tin_creation_registry` transaction.
4. **Confirm ZK-PRU route creation** on devnet — Execute ZK-PRU guard initialization.
5. **Confirm Cranker execution** on devnet — Process a ZK-PRU spend and private payout.
6. **Documentation corrections** — Apply canonical TSN positioning across all docs before any further protocol changes.
