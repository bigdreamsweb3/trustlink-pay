# Cross-Network Payments Research Brief

## Purpose

This brief explains how TSN can support payments between different networks using the same basic operating model banks use when they settle with one another: each institution keeps control of its own ledger and liquidity, while a trusted authorization and messaging process allows the receiving institution to release a corresponding amount.

The model is correspondent settlement, not an atomic bridge. Source funds remain on Solana. Destination liquidity is held on Creditcoin. Sepolia is used as the public proof surface that Attestcoin can read and verify.

## The banking analogy

When Bank A sends value to Bank B, the banks do not normally move the same physical cash through an intermediary. Bank A debits its customer or reserves an obligation, Bank B verifies the message and its settlement conditions, and Bank B credits the recipient from liquidity already available in its own system. The banks later reconcile their records and handle exceptions.

TSN follows the same separation:

| Banking function | TSN equivalent |
| --- | --- |
| Source bank authorizes an obligation | Mother authority accepts the TSN intent on Solana |
| Source bank reserves or holds value | Solana Epoch Treasury and its ledger |
| Payment instruction is authenticated | Canonical cross-domain commitment signed by the governed secp256k1 signer |
| Interbank message network carries the instruction | Relay or Cranker publishes the commitment to Sepolia |
| Receiving bank verifies the message | Attestcoin proves the Sepolia event; Creditcoin revalidates its fields |
| Receiving bank pays its customer | Creditcoin settlement contract pays from destination liquidity |
| Banks reconcile later | TSN records receipts, nullifiers, status, and settlement/reversal state |

The analogy has limits. A blockchain contract cannot rely on an informal banking relationship. Every authority, amount, asset, destination, expiry, and replay rule must be explicit and machine-verifiable.

## Network roles

### Solana: source authorization and custody

Solana remains the source domain for TSN authorization and source-side funds. The important controls are:

- Mother Escrow and its external authority key.
- `AcceptedIntentV1` and its canonical commitment fields.
- Epoch Treasury and settlement ledger.
- Settlement DNA for private payout flows.
- Permit signer and domain-separated permit messages.
- Nullifiers, consumed receipts, claim slots, and sequence checks.

The current repository does not yet prove that each accepted intent is funded by a specifically linked treasury reservation. That funding relationship must be independently provable before a cross-network payment is presented as fully collateralized.

### Sepolia: proof surface

Sepolia is not a custody network in this model. A commitment contract publishes a canonical settlement commitment after verifying the governed secp256k1 signature and nonce. The contract emits an event that Attestcoin can read and prove.

The relay only transports the signed commitment to the contract. It must not be able to change the settlement fields or create a valid commitment without the governed signer.

### Attestcoin: external-chain proof

Attestcoin provides the proof layer for the Sepolia event. Its documented USC model uses attestation, Merkle inclusion, continuity, and finality evidence. The proof establishes that the event occurred on the proof-surface chain; it does not independently prove TSN’s Solana state or treasury funding.

Writability should not be part of the initial build. The current documentation describes writability as undergoing testing and audits, and it is not a substitute for liquidity. Even when available, writability would carry an authenticated message to a destination contract; the destination would still need its own liquidity to pay.

### Creditcoin: destination settlement

Creditcoin receives the Attestcoin proof and validates the complete settlement payload. The destination contract must verify:

- Proof validity and source transaction success.
- Commitment contract and event identity.
- Authorized signer and signature.
- Source and destination domains.
- Asset identifier and amount.
- Recipient and destination account.
- Epoch, intent, nonce, expiry, and status.
- Destination nullifier uniqueness.

Only after all checks pass may the Creditcoin liquidity pool credit the recipient.

## Trust and failure boundaries

The system has explicit trust roots rather than an implicit trusted bridge:

| Component | What it may do | What it must not be able to do |
| --- | --- | --- |
| Mother/governance authority | Authorize and rotate governed protocol keys | Allow an unregistered key to authorize settlement |
| Cross-domain secp256k1 signer | Sign canonical settlement commitments | Change a commitment after signing or sign outside its purpose policy |
| Node | Verify and prepare off-chain evidence | Create on-chain authorization or settlement authority |
| Receiver | Store and lease work | Change signed settlement terms |
| Cranker/relay | Submit or transport an already authorized payload | Substitute amount, recipient, asset, destination, or nonce |
| Attestcoin | Prove the Sepolia event and finality | Prove Solana semantics that were not included in the commitment |
| Creditcoin contract | Revalidate and settle against destination liquidity | Accept an unverified or replayed event |

Availability remains a separate concern from correctness. A malicious Node, Receiver, or relay may delay or censor work, but it should not be able to redirect funds. A compromised authorization key remains a material loss of authority, so registration, rotation, expiry, and emergency pause procedures are required.

## Why this is not an atomic bridge

The source-side and destination-side balances are not transferred in one atomic operation. Solana holds the source-side obligation and liquidity; Creditcoin pays from prefunded destination liquidity. This introduces operational requirements that a token bridge can sometimes avoid:

1. Destination liquidity must be funded before settlement.
2. Source and destination records must be reconciled.
3. Expired, rejected, and partially completed obligations need explicit states.
4. A reversal or reimbursement process is required for cross-domain failures.
5. Limits and risk controls must apply per asset, signer, epoch, and destination.

The correct product description is therefore “cryptographically authorized destination-side liquidity against a source-side obligation.” It should not be described as transporting stablecoins through Attestcoin.

## Recommended operating lifecycle

```text
CREATE
  Solana intent and source-side terms are created
        |
AUTHORIZE
  Mother authority and governed cross-domain signer authorize the commitment
      |
PUBLISH
  Relay submits the unchanged commitment to Sepolia
      |
PROVE
  Attestcoin proves the Sepolia event and finality
      |
SETTLE
  Creditcoin verifies all fields, consumes the destination nullifier, and pays
      |
RECONCILE
  Source and destination receipts are matched; exceptions are recorded
```

Every transition should be idempotent and observable. A retry must either return the existing receipt or fail with a clear already-consumed, expired, invalid-proof, or insufficient-liquidity reason.

## Research conclusions

- The correspondent-bank analogy is accurate when it is limited to prefunded destination liquidity and reconciliation.
- Solana can remain the source of funds and authorization while Sepolia is the proof surface.
- Attestcoin proves the Sepolia commitment event; it does not transport or custody money.
- The cross-domain secp256k1 signer is a new purpose-isolated trust root and must be governance-visible.
- The first useful implementation is readability-only: Solana authorization, Sepolia publication, Attestcoin proof, and Creditcoin settlement.
- Writability, direct Solana Attestcoin support, atomic liquidity movement, and full reversal are later capabilities, not prerequisites for the first defensible demo.
