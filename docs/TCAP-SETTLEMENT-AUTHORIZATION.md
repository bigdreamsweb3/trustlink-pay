# TCAP Settlement Authorization

**Version:** Phase 2 / contract architecture  
**Status:** Interfaces and state foundations only; no production proof verifier or fund-moving TCAP instruction is enabled  
**Legacy TSN:** unchanged and still active

## 1. Authorization replacement

TCAP replaces the legacy settlement bridge:

```text
sender escrow -> Cranker liquidity payout -> reimbursement
```

with:

```text
payer-funded isolated reserve
-> pending confidential liability
-> funded-intent leaf
-> accepted epoch root
-> private membership + settlement proof
-> one-time nullifier
-> reserve payout or confidential output
-> epoch reward allocation
```

The **funding commitment** is a pending authorized settlement claim, not a
confidential ownership commitment. It may later settle to a confidential
container or authorize a public reserve exit. A Cranker transports
proof-bearing work; it never owns principal, witnesses, vault authority or
arbitrary withdrawal permission.

The three commitment classes remain distinct:

- **Funding commitment:** created by reserve funding; represents a pending
  authorized claim.
- **Confidential ownership commitment:** represents private ownership state in
  a container and is spendable only through a valid state transition.
- **Exit authorization/commitment:** authorizes a specific public redemption
  from the reserve and exposes the public destination and amount by design.

## 2. Core privacy invariant

A final recipient settlement transaction must not require or expose the payer wallet, payer token account, original Payment Intent PDA, sender-linked pending-liability PDA, legacy escrow PDA, deterministic sender container PDA, reusable public intent identifier, unchanged funding-side commitment, or funding transaction reference.

Settlement is authorized only by an accepted epoch root, private membership witness, one-time nullifier, valid domain-specific proof and TCAP-controlled reserve authority. The original intent is finalized, expired, carried forward or closed independently.

This prevents direct account equality matching. It does not alone prevent statistical correlation through amount, timing, asset rarity, ordering, RPC metadata or small anonymity sets.

## 3. Data classification

| Class | Examples |
|---|---|
| Public Solana accounts | TCAP config, asset registry entry, isolated vault, reserve aggregate, epoch state, state root, nullifier record/accumulator, reward root |
| Public commitments | funding record digest, accepted epoch root, TCAP state root, output commitments, nullifier, settlement/reward/refund roots |
| Encrypted data | recipient output ciphertext, change/refund ciphertext, private receipt envelope |
| Private witness | amount, asset opening, payer authorization secret, recipient route opening, refund opening, nonce/randomness, Merkle path, note ownership key |
| Proof public inputs | protocol/network/domain versions, accepted epoch root, prior/next state root, nullifier, asset registry commitment, public exit destination/amount when applicable, opaque output commitments |
| Proof private inputs | funded-leaf opening/path, note opening/path, amount/asset openings, authorization secret, recipient/refund routing openings, randomness and conservation witness |

Private witnesses must never appear in program logs, application APIs, Cranker messages, analytics or settlement account lists.

## 4. Domain separation

Every digest begins with a fixed domain tag and protocol/network version. Phase 2 defines distinct domains for funded intents, funding records, epoch leaves, TCAP notes, recipient outputs, funded-intent nullifiers, note-spend nullifiers, refund nullifiers, fee receipts, settlement receipts, reward leaves and reward claims.

No digest from one domain is valid in another domain.

## 5. Funded commitment V1

The private opening binds:

```text
domain, protocol version, network, canonical asset ID,
principal, settlement fee, protocol fee,
recipient route commitment, refund authority commitment,
expiry, nonce, settlement conditions,
payer authorization domain, randomness,
minimum/maximum admissible epoch
```

The exact hash-to-field encoding remains subject to the selected circuit. Phase 2 SDK types define the canonical field order and domain, but do not claim circuit compatibility.

## 6. Funding-side versus settlement-side forms

Funding may expose a funding-record digest and an opaque accumulator leaf. Settlement must not repeat the funding record, leaf, leaf index or intent address. Instead, the proof establishes that a hidden leaf is a member of the accepted epoch root and that the settlement output matches its hidden opening.

If the eventual proof system reveals the leaf or membership position, direct equality correlation remains possible and full unlinkability must not be claimed. Phase 3 must select a construction with hidden leaf/path or explicitly downgrade the privacy statement.

## 7. Pending liabilities

The preferred model is hybrid:

- reserve accounts expose only aggregate pending liabilities per asset;
- individual funded authorizations are leaves in an accumulator;
- an optional payer status record contains only a blinded status reference and is never a settlement account;
- epoch records absorb accepted leaves into a root;
- settlement consumes liability through a nullifier and aggregate accounting transition.

A pending liability never holds tokens and never contains plaintext recipient data. It may settle confidentially, exit publicly, refund, expire or carry forward.

## 8. Epoch intent accumulator

Phase 2 uses versioned deterministic binary leaf encoding and root-builder interfaces. The final accumulator choice remains open. Required properties are duplicate-leaf rejection, canonical ordering policy, append/finalization rules, immutable finalized roots, explicit carry-forward/refund roots and a concurrency model.

An `EpochCommitmentStateV1` commits to epoch ID, accepted-intent root, previous/next TCAP roots, eligibility root, settlement result root, reward root, carry-forward root, expired root and refund root.

The Phase 2 deterministic root utility is an accounting utility, not a private-membership proof system.

## 9. Nullifiers

Separate nullifier domains exist for funded-intent settlement, note spending, public refund and reward claims. A nullifier is deterministic from secret spend authority and context, one-time, non-reversible under the selected construction and checked against consumed state.

Phase 2 provides opaque types, format validation and duplicate detection. It does not derive production nullifiers before the circuit/key design is selected.

## 10. Settlement lifecycles

### Public-wallet-funded payment

Funding atomically transfers principal to the isolated TCAP vault, settlement fee to the TSN fee vault, optional protocol fee to its configured destination, increments aggregate pending liabilities, registers a blinded funding record and creates `PaymentIntentV2`. Failure of any instruction reverts all effects.

### Existing TCAP-position payment

The sender consumes a confidential ownership commitment using a note-spend
nullifier and creates recipient/change ownership commitments. It does not reuse
the public-deposit funding-commitment opening.

### Epoch inclusion and carry-forward

Eligible funded leaves are absorbed into a finalized accepted-intent root. Unsettled valid leaves move through a separate carry-forward root; they are not silently copied into two spendable roots. Expiry/refund roots are mutually exclusive with settlement consumption.

### Public recipient

Proof verification over the accepted root, hidden funded opening, public recipient/amount/asset and unused nullifier authorizes an exact CPI from the isolated reserve. The public exit exposes destination, asset, amount and reserve, but not source intent or payer.

### Confidential recipient

Proof verification consumes aggregate pending liability, creates opaque encrypted output commitments, and changes the TCAP state root. Vault token balance remains unchanged.

### Refund

A refund proof binds the hidden refund authority and exclusive expiry/cancellation state. Its nullifier races safely with settlement: exactly one transition may consume the authorization.

### Epoch close and rewards

Verified receipts determine deterministic aggregated reward leaves. The reward root and fee liabilities finalize at epoch close. A Cranker later claims an aggregate reward with a reward proof/nullifier; reward claims never reference payer intents.

## 11. Public state transitions

| Stage | State updated |
|---|---|
| Funding | vault balances, aggregate pending/fee liabilities, blinded funding record, PaymentIntentV2 status |
| Epoch acceptance | accepted-intent root and immutable epoch metadata |
| Settlement | nullifier state, aggregate liabilities, TCAP root or exact public vault debit, opaque receipt |
| Refund | refund nullifier, pending/refund liabilities, exact public debit or encrypted refund output |
| Epoch close | result/carry-forward/expired/refund/reward roots and fee allocation liabilities |

## 12. Proof boundary

Typed interfaces exist for funded membership, public settlement, confidential settlement, note spend, refund and epoch transition proofs. Production verification is intentionally absent. The only Phase 2 verifier rejects all proofs.

Required future work:

- choose proof system and curve/field encoding;
- implement circuits for membership, authorization, asset/amount conservation and root transitions;
- select trusted or transparent setup;
- implement and benchmark a Solana verifier;
- define proof aggregation and root concurrency;
- complete independent cryptographic audit.

No hash, Cranker signature or test fixture is a substitute for these proofs.

## 13. Threat model

| Risk | Phase 2 treatment |
|---|---|
| Account-list correlation | Settlement request types exclude payer, intent and pending accounts |
| Repeated digest correlation | Funding and settlement forms are distinct; final guarantee depends on hidden membership proof |
| Amount/timing correlation | Remains metadata risk; batching/denomination policy is future research |
| Reserve insolvency | Checked aggregate invariant and isolated asset states |
| Fee insolvency | Independent TSN fee invariant |
| Duplicate settlement/refund race | Domain-separated one-time nullifiers and exclusive state machine |
| Epoch root replacement | Finalized roots must be immutable; governance rules required on chain |
| Malicious Cranker | Preflight checks are advisory only; TCAP atomically verifies nonce/state version, expiry, fee authorization, proof validity, and unused nullifier before changing state |
| Malicious payer/route | Commitment and proof validation required |
| Invalid exit/proof replay | Rejecting verifier now; production verifier plus nullifier required later |
| Root concurrency/front-running | Unresolved circuit/program design; must be benchmarked |
| Asset/vault substitution | Canonical `(token program, mint, registry version, asset commitment)` and PDA validation |
| Token-2022 fee/freeze/clawback | Explicit registry policy and received-amount accounting required |

## 14. Non-production boundary

This phase does not redirect funds, create live TCAP vaults, enable public exits, or claim confidential settlement. Legacy accounts and instructions remain unchanged. Phase 2 contracts are reviewable foundations for Phase 3 on-chain instructions and cryptography selection.
