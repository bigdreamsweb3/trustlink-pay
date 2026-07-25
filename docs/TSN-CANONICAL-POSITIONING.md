# Transfer Settlement Network — Canonical Positioning

> Authoritative protocol positioning document.
> All TSN documentation, UI copy, SDK comments, and public communications must conform to this specification.
> Date: 2026-07-23

---

## 1. What TSN Is

**Transfer Settlement Network (TSN)** is the complete blockchain payment network. It is identity-first, privacy-preserving blockchain payment infrastructure designed to provide a mobile-money-style payment experience.

TSN is a single protocol network. It contains:

- TIN payment identity
- ZK-PRU privacy authorization and protected receiving infrastructure
- Confidential asset infrastructure (TCAP)
- Settlement coordination
- Cranker execution
- ZK-PRU privacy authorization and purpose-bound identity

TSN is the network. TIN, TCAP, ZK-PRU, settlement, authorization, and Cranker coordination are **internal protocol components** of TSN.

### Prohibited framing

```
WRONG:  TSN is the settlement layer. Combine it with separate identity, asset, and privacy products.
RIGHT:  TSN is the complete payment network. It includes TIN payment identity, ZK-PRU privacy authorization, TCAP confidential assets, settlement coordination, and Cranker execution.
```

---

## 2. Why TIN Is Required for Native TSN Participation

A native TSN user **must** have a TIN (Transfer Identity Number). The TIN is the human-facing payment identity. The sender selects a recipient TIN instead of requesting a wallet address.

**TIN-to-TIN payment is the main protocol experience.** Wallet-based paths are compatibility and onboarding/off-ramp options.

---

## 3. The Mobile-Money-Style Payment Experience

TSN is designed to provide a payment experience analogous to mobile money systems:

- The sender enters a recipient's numeric identifier (TIN)
- The sender sees identity confirmation before authorizing payment
- The sender does not need to know the recipient's wallet address
- The recipient does not learn the sender's wallet from the recipient-side settlement transaction
- Settlement happens in the background
- The Cranker (not the sender) pays the settlement transaction fee

---

## 4. Internal TSN Protocol Components

```
Transfer Settlement Network
├── TIN payment identity         — Human-facing Transfer Identity Numbers
├── ZK-PRU receiving infrastructure — Protected receiving identities per TIN
├── TCAP confidential assets     — Confidential asset and reserve-backed ownership
├── Settlement coordination      — Payment intents, authorization, routing, lifecycle
├── Cranker execution            — Fee-paying operators that submit settlement txs
└── ZK-PRU                     — Device-side privacy authorization and protected receiving control
```

---

## 5. TIN-to-TIN Lifecycle

1. **TIN registration**: User creates a TIN. The Transfer Identity program creates an identity PDA from the owner pubkey. Owner wallet is stored as SHA-256 commitment, never as readable authority.

2. **ZK-PRU initialization**: The user's wallet initializes ZK-PRU. A random master seed is encrypted into the ZK-PRU registry, and purpose-bound protected receiving handles are derived on the user's device. TSN infrastructure never owns the decrypted root secret.

3. **Route authorization**: Sender enters recipient TIN. The user's device authorizes the applicable ZK-PRU protected route. TSN receives only the minimum signed commitment or proof required for settlement.

4. **Sender authorization**: Sender signs a TSN payment intent specifying amount, token, recipient TIN hash, and settlement constraints.

5. **Cranker execution**: Cranker validates the intent, pays the transaction fee, and submits the authorized settlement transaction. The Cranker pays the fee so the sender's public wallet does not appear in the recipient transaction.

6. **Settlement and receipt**: TSN records authorization and settlement receipts. The recipient receives funds through their ZK-PRU protected receiving infrastructure.

---

## 6. Public-Wallet Compatibility Paths

Wallet-based paths are **compatibility and onboarding/off-ramp options**, not the core definition of TSN.

Supported paths:

- Public wallet to TIN
- TIN to public wallet
- Public wallet to confidential TSN ownership through ZK-PRU authorization
- Confidential TSN ownership to public wallet
- Public wallet to public wallet (using TCAP transaction separation)
- Confidential ownership to confidential ownership

The strongest intended privacy belongs to **TIN-to-TIN payments**.

TSN is **not** a generic wallet-to-wallet mixer or privacy relay.

---

## 7. TCAP's Role

TCAP (Token Control and Authorization Protocol) is TSN's **confidential asset and reserve-backed ownership infrastructure**. It manages:

- Approved-asset metadata
- Reserve state and backing
- Funding claims
- Future confidential asset representation
- Commitments, nullifiers, and confidential ownership roots

TCAP is **not** the network coordinator. That is TSN settlement coordination. TCAP is one internal component of TSN.

### Current TCAP status

- **Phase 1 (deployed)**: Reserve backing.
- **Phase 2 (partial)**: Pending Funding Claims alongside reserve deposits.
- **Future**: Confidential asset containers, proof acceptance, nullifier consumption, atomic ownership transitions, public exits.

---

## 8. Cranker's Role

Crankers are TSN settlement operators. They:

- Watch the TSN mempool for eligible payment work
- Validate payment intents (signatures, amount, token, route, nonce, expiry)
- **Pay transaction fees** for settlement transactions
- **Submit authorized settlement transactions**
- Coordinate settlement receipts and liveness
- Build reputation through correct work

### What Crankers DO NOT do

- Do **not** provide liquidity from their own capital as the primary settlement mechanism
- Do **not** custody user funds
- Do **not** act as financial intermediaries

**Vault liquidity** (when used) is an operator-supplied, reimbursement-based mechanism — not user fund custody. The final TSN model does not require Cranker vault liquidity for settlement.

---

## 9. ZK-PRU privacy authorization boundary

The current transitional privacy model:

- The user's wallet initializes the ZK-PRU registry and controls recovery access.
- Encrypted root material is retrieved to the user's device and decrypted only there.
- Purpose-bound ZK-PRU handles and Layer 2 authorization keys are derived only for approved protocol purposes.
- TSN nodes and Crankers receive authorized messages, commitments, or proofs—not the decrypted master seed.

Runtime claims still require deployment and transaction evidence. Source, SDK, or documentation presence does not prove a deployed ZK verifier.

---

## 10. Device-side ZK-PRU operation

The ZK-PRU device model is:

- Private ZK-PRU receiving routes are decrypted or derived on the user's device
- The user authorizes the route locally
- The device generates the required commitment or proof
- TSN receives only minimum settlement data
- TSN nodes never receive master seeds, raw ZK-PRU private keys, private decryption keys, private ownership witnesses, or plaintext confidential state

The architecture name is not itself deployment evidence. Report deployed circuits, verifiers, and confirmed transactions separately.

---

## 11. Allowed Privacy Claims

The following terms are **allowed** when clearly presented as design goals, not as empirically verified properties:

| Term | Usage guidance |
|------|---------------|
| Privacy-preserving | Acceptable as a design goal |
| Confidential settlement architecture | Describes TCAP and transaction separation |
| Protected payment routing | Describes ZK-PRU infrastructure |
| Sender and recipient transaction separation | Self-explanatory; this is measurable |
| Identity-first private payment design | Describes the TIN-based model |
| Intended to reduce public wallet linkage | Honest about intent |
| Device-side privacy authorization | Describes the active ZK-PRU architecture |

---

## 12. Prohibited Privacy Claims (Until Deployed and Verified)

The following claims are **prohibited** in all documentation, UI, SDK comments, and public communications unless the feature is deployed on-chain and empirically verified:

| Prohibited phrasing | Reason |
|---------------------|--------|
| Fully anonymous | Not achieved at any deployment level |
| Impossible to trace | Overclaims current capabilities |
| Complete unlinkability | Not empirically verified |
| Fully zero knowledge | Prohibited without deployed verifier and empirical evidence |
| Nobody can ever identify the sender or recipient | Absolute claim, unverifiable |
| Stronger than every competing privacy protocol | Comparative claim requiring evidence |
| No wallet linkage under all threat models | Absolute claim, unverifiable |

---

## 13. Current Deployment Status vs Target Architecture

| Area | Current (Transitional) | Target Architecture |
|------|----------------------|-------------------|
| ZK-PRU route authorization | User-device authorization | Device-side ZK-PRU proofs or signed commitments |
| Cranker model | Validates, pays fees, submits txs; vault liquidity optional | Fee-paying submission only; no vault liquidity dependency |
| TCAP | Reserve deposits + Funding Claims (Phase 1-2) | Full confidential ownership, nullifiers, atomic transitions |
| TIN registration | Partially node-assisted | Fully user-controlled |
| Privacy level | Transaction separation, SHA-256 destination hashes | ZK privacy, no plaintext routing data on node side |

---

## 14. Canonical Vocabulary

### Required replacements

| Instead of this term | Use this term |
|---------------------|---------------|
| Identity layer / TIP layer | TSN identity component or TIN identity |
| Settlement layer | TSN settlement coordination |
| Privacy authorization | ZK-PRU purpose-bound protected receiving identity |
| Confidential asset layer | TSN confidential asset infrastructure (for TCAP) |
| Operator layer | TSN execution (for Crankers) |
| TIN + TSN + TCAP + ZK-PRU | TSN (containing TIN, ZK-PRU, TCAP, settlement coordination, and Crankers) |
| Protocol layers / architecture layers | Protocol components |
| Cranker vault liquidity | Cranker-supplied settlement liquidity (reimbursement-based) |

### Correct terms

| Concept | Canonical term |
|---------|---------------|
| The complete network | Transfer Settlement Network (TSN) |
| User-facing payment identity | TIN (Transfer Identity Number) |
| Receiving infrastructure | ZK-PRU purpose-bound protected receiving identity |
| Token control protocol | TCAP (within TSN) |
| Settlement operators | Crankers |
| Privacy authorization architecture | ZK-PRU |
| The user-facing application | TrustLink Pay |
| Settlement coordination | TSN settlement coordination (internal component) |

### Capitalization rules

- **Transfer Settlement Network**: Capitalized, "the" lowercase before it
- **TSN**: All caps; use "TSN" for the whole network, not "the TSN"
- **TIN**: All caps, always
- **ZK-PRU**: Canonical name for every protected receiving identity and authorization handle
- **TCAP**: All caps; never "TCAP protocol"
- **Cranker**: Capitalized (proper noun); never "cranker" lowercase
- **ZK-PRU**: With hyphen, all caps; never "zero-knowledge PRU" in running text
- **TrustLink Pay**: Capitalized with space; never "Trustlink" or "TrustLinkPay"
- **TIN Master Seed**: Capitalized; never "master seed" alone in protocol context
- **PruSpendGuard**: Internal compatibility identifier for a ZK-PRU authorization guard

---

## Enforcement

1. All new documentation must conform to this canonical positioning.
2. Existing documentation must be updated to conform before any protocol logic changes.
3. PRs adding UI strings, SDK comments, or program comments must pass a positioning review.
4. No public-facing material (blog posts, website copy, pitch decks) may use the "layers" or "TIN+TSN+TCAP+ZK-PRU" framing.
5. No document may claim deployed zero-knowledge privacy until on-chain ZK-PRU verification is empirically confirmed on devnet.
