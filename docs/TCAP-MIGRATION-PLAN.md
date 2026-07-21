# TCAP Settlement Architecture Migration Plan

**Status:** Approved architecture; staged implementation in progress  
**Legacy path:** remains active until versioned TCAP flows pass migration and adversarial tests  
**Canonical replacement:** TCAP completely replaces Veil/VPP

## 1. Repository architecture inventory

| Area | Current implementation | Migration impact |
|---|---|---|
| Solana settlement program | `tsn-protocol/tsn/protocol/programs/trustlink-escrow` | Main protocol migration surface |
| Payment Intent | `tsn/state/intent.rs` | V1 exposes mint, amount, recipient hash, assigned Cranker and payout signature; replace with V2 commitment-only coordination record |
| Mother escrow | `tsn/state/mother_escrow.rs` | Contains epoch controls and LP/Cranker/treasury fee splits; split into TSN configuration, fee reserve and TCAP configuration |
| Cranker liquidity | `tsn/state/vault.rs`, `initialize_cranker_vault.rs`, `fund_cranker.rs`, `withdraw_cranker_funds.rs` | Deprecate after migration; no TCAP equivalent |
| Liquidity positions | `LiquidityPosition` in `tsn/state/vault.rs` | Remove after LP withdrawal/migration plan |
| Payout execution | `submit_proof.rs`, `execute_vault_payout.rs` | Currently pays from Cranker vault and distributes LP fees; replace with proof-authorized TCAP transition |
| One-time private escrow | `register_private_commitment.rs`, recovery instructions | Preserve commitment/replay concepts; replace per-payment escrow custody and gas reimbursement |
| Epoch commitments | `tsn/state/epoch_settlement.rs`, `epoch_settlement.rs` | Reuse versioning concepts; replace reimbursement fields with intent, settlement, reward and refund roots |
| Claim credits | `tsn/state/cranker.rs`, `claim_vault_settlement.rs` | Preserve fairness intent; harden eligibility, receipts and Sybil resistance |
| Replay protection | private replay registry, PRU spend guard, nullifier fields | Reuse reviewed primitives where compatible; introduce domain-separated TCAP nullifiers |
| SDK | `tsn-protocol/tsn-sdk` | Split TCAP asset contracts into a dedicated SDK; TSN SDK retains coordination APIs |
| Mempool/daemon | `tsn-mempool-backend`, `tsn-cranker-op-daemon`, `tsn-cranker-sdk` | Remove liquidity assumptions; consume epoch work and produce execution receipts |
| Backend/frontend | payment creation, TSN registration, send estimates, escrow validation and claim UI | Migrate only after versioned SDK/on-chain support exists |
| Veil/VPP | `vpp/` | Frozen legacy concept; migrate useful research/crypto only after review, then remove from canonical architecture |

## 2. Legacy dependency map

```text
MotherEscrow
├── fee_split_lp_bps ──> submit_proof ──> LP rewards
├── fee_split_cranker_bps ──> direct Cranker payout
├── epoch_id ──> intent/vault/reimbursement records
└── protocol_seed ──> Cranker DNA and permit domains

CrankerVault
├── funded by FundCranker
├── owned through vault-authority PDA
├── pays recipient in SubmitProof
├── pays operator/treasury/recovery amounts
└── retains LP reward accounting

PaymentIntent V1
├── exposes amount and recipient hash
├── assigns a Cranker publicly
├── records payout signature
└── is passed through settlement lifecycle

PaymentCommitment V1
├── stores plaintext amount
├── binds Cranker lease
└── records reimbursed boolean
```

Reusable security logic must be extracted before deprecated accounts are removed: checked arithmetic, canonical PDA validation, mint constraints, lease expiry, Cranker DNA, permit domains, replay registries, claim-credit accounting, epoch sequencing and intent status guards.

## 3. Proposed account model

### TCAP accounts

- `TcapConfigV1`: authority, protocol version, registry root/version and pause controls.
- `TcapAssetEntryV1`: exact mint, token program, decimals, asset commitment, vault and admission state.
- `TcapReserveV1`: asset entry, token vault, settled liability, pending liability, withdrawal liability and accounting epoch.
- `TcapStateRootV1`: previous/current confidential root, sequence and verifier configuration.
- `TcapNullifierV1` or a scalable nullifier accumulator: domain-separated consumed-state protection.
- `TcapPendingCommitmentV1`: logical confidential liability represented in an accumulator, not a sender-linked account required at payout.

### TSN accounts

- `PaymentIntentV2`: data and commitments only; zero token custody.
- `EpochV2`: accepted-intent root, previous/next TCAP roots, settlement receipt root, reward root, refund root and carry-forward root.
- `TsnFeeReserveV1`: token vault and committed unpaid/refundable fee liabilities.
- `CrankerRewardClaimV1`: epoch/operator claim uniqueness or equivalent bitmap/accumulator.

## 4. Proposed instruction model

1. `register_tcap_asset`
2. `initialize_tcap_reserve`
3. `initialize_tsn_fee_reserve`
4. `fund_public_intent_v2` — atomic principal, fees, pending commitment and intent creation.
5. `accept_epoch_intent_root_v2`
6. `settle_tcap_confidential_v1`
7. `settle_tcap_public_exit_v1`
8. `refund_tcap_pending_v1`
9. `close_epoch_v2`
10. `claim_cranker_reward_v1`

Settlement instructions must not receive the payer wallet, Payment Intent PDA, sender-linked pending PDA, escrow PDA or deterministic sender container.

### Commitment-class clarification

The funding instruction creates a **funding commitment** representing a
pending authorized claim. It does not create a confidential ownership
commitment or a spendable container balance. Later instructions must keep these
classes separate:

1. Funding commitment: reserve-funded pending claim.
2. Confidential ownership commitment: private container ownership state.
3. Exit authorization/commitment: authorization for a public reserve exit.

The implementation sequence is: fund and record the funding commitment,
settle it to a container or public exit, then support ownership-commitment
transitions. No public `spent` flag may be written onto ownership commitments.

## 5. TCAP reserve model

Each approved `(token_program, mint)` pair has an isolated vault and accounting record. Names and symbols have no authority. Required invariant:

```text
vault assets >= settled claims + pending claims + withdrawal liabilities
```

Principal cannot fund protocol or Cranker rewards. Transfer-fee assets require received-amount accounting; declared amounts are insufficient.

## 6. TSN fee reserve model

Settlement fees enter a TSN-controlled asset-specific fee vault during atomic funding. Protocol fees enter the configured treasury/reserve. Required invariant:

```text
fee vault assets >= unpaid rewards + refundable fees + committed fee liabilities
```

Epoch reward allocation is aggregated and proof-claimed. It never references an individual payer intent during reward withdrawal.

## 7. Commitment and nullifier model

Normative construction is unresolved until the proof system is selected. The committed witness must bind at least:

```text
domain, protocol version, network, asset commitment, amount,
recipient route commitment, refund authority commitment,
settlement fee, protocol fee, expiry, nonce,
settlement conditions, randomness
```

A nullifier must be domain-separated by protocol/version/network and derived from secret witness material plus commitment position. It must not reveal or be reversible to the funding transaction or Payment Intent PDA.

No hash-only placeholder may be described as a zero-knowledge proof.

## 8. Sender-recipient unlinkability analysis

Mandatory public-account separation:

- funding exposes payer-to-TCAP/TSN reserve movement but not recipient route;
- settlement proves membership in an accepted epoch root without passing the source intent;
- payout does not pass a sender-linked pending account;
- confidential settlement updates roots/nullifiers/opaque outputs, not sender and recipient PDAs together;
- public exit necessarily exposes destination, asset and amount but not the originating deposit;
- epoch Cranker rewards aggregate many settlements.

Remaining correlation risks include timing, unique amounts, rare assets, small anonymity sets, fee fingerprints, ordering, RPC metadata and application telemetry. Batching, amount policies and network privacy require separate research.

## 9. Epoch lifecycle

```text
Open -> accept funded intent commitments -> snapshot intent root
-> allocate eligible work -> verify settlement receipts
-> compute next TCAP root -> compute carry-forward/refund roots
-> compute reward allocation root -> prove liability invariants -> Closed
```

No force-close path may bypass root or liability verification.

## 10. Cranker reward lifecycle

Intent work earns replay-resistant claim credit. Eligible settlement work produces a receipt. Epoch closure deterministically allocates committed fees, penalties and refunds. A Cranker claims one aggregated allocation using the finalized reward root. Principal reserves are never in this path.

## 11. Migration phases

1. Localnet-test reserve deposits and prove reserve/vault accounting.
2. Design pending funding commitments and their accumulator leaf format.
3. Implement deposit plus funding commitment atomically.
4. Implement funding settlement to a container or an authorized public exit.
5. Test commitment-root transitions and liability conservation.
6. Design encrypted container state and state-version rules.
7. Implement nullifiers, nonce/state-version checks, expiry, and fee
   authorization atomically inside TCAP.
8. Prove TSN and Crankers cannot arbitrarily withdraw TCAP reserves.
9. Implement confidential ownership transfers and redemption proofs only after
   the preceding gates pass.
10. SDK, Private View, frontend, backend and operator migration.
11. Disable legacy creation, migrate/withdraw legacy state, then remove
    escrow/liquidity/reimbursement code.

## 12. Files to modify

- Solana program `src/lib.rs`, `src/tsn/state`, `src/tsn/instructions`, events/errors/constants and IDL.
- TSN SDK contracts, transaction builders and Cranker interfaces.
- Mempool schemas/services and Cranker daemon.
- Backend payment creation/read models.
- Frontend send, activity, claim and estimate experiences.
- Root and protocol documentation.

## 13. Files/features to deprecate after migration

- `CrankerVault`, `LiquidityPosition`, Cranker funding/withdrawal instructions.
- mother-escrow LP splits.
- reimbursement processing and `reimbursed` state.
- per-payment escrow token accounts and recovery path.
- direct payout from Cranker vaults.
- Veil/VPP terminology and SDK exports.

## 14. Security risks

- custom proof-system unsoundness;
- reserve/liability divergence;
- double-nullification races;
- transfer-fee token mismatch;
- root-update concurrency and account contention;
- timing/amount correlation;
- malicious epoch root or reward allocation;
- refund authorization leakage;
- Cranker Sybil farming;
- verifier upgrade/governance compromise;
- wallet or authorized-device compromise.

## 15. Unresolved cryptographic assumptions

Before confidential settlement is implemented, TrustLink Labs must select and specify:

- commitment hash and field encoding;
- note encryption and recipient discovery;
- ownership/spend authorization proof;
- asset and amount conservation circuit;
- commitment-tree and nullifier construction;
- Solana verifier program and compute limits;
- trusted setup or transparent-proof assumptions;
- proving location and witness protection;
- concurrency strategy for state roots.

Interfaces may be versioned before this selection. Mock proof acceptance must never enter a production or privacy-claiming path.

## 16. Test plan

Tests must cover atomic funding, exact mint/program/decimals, transfer-fee receipt, reserve separation, liability conservation, unauthorized withdrawals, root membership, wrong roots/assets/amounts/recipients, nullifier replay, source-account absence from payout, confidential output opacity, deterministic epoch rewards, double reward claims, refund/carry-forward rules and legacy migration. Transaction-account and event snapshots must enforce unlinkability invariants.

## Immediate versus blocked work

Implement immediately: versioned data contracts, checked invariant helpers, registry validation, reserve separation, intent/epoch schemas, migration inventory and tests for deterministic accounting.

Cryptographically blocked: production confidential settlement, hidden asset/amount conservation and unlinkable recipient output creation until a concrete audited proof construction and verifier are selected.

Must not be approximated: accepting a hash or Cranker signature as proof of confidential value conservation; passing the source intent into payout; publicly updating deterministic sender/recipient containers together; logging private witnesses.
