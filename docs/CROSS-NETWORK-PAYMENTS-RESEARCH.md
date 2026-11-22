# Historical cross-network research brief

**Status: HISTORICAL / RETIRED prototype model, reviewed 2026-11-22.** This preserves the original correspondent-settlement reasoning and its proposed proof-surface design. The former destination/proof-middleware dependency and Sepolia intermediary are no longer the build plan. References to signer registration and receipt states below are historical design proposals, not existing APIs or approved keys. Use the [current integration plan](CROSS-NETWORK-PAYMENTS-BUILD-PLAN.md) for scope. Network and middleware labels below are editorial descriptions of the retired prototype, not replacement adapters.


## Purpose

This brief explains how TSN can support payments between different networks using the same basic operating model banks use when they settle with one another: each institution keeps control of its own ledger and liquidity, while a trusted authorization and messaging process allows the receiving institution to release a corresponding amount.

The model is correspondent settlement, not an atomic bridge. Source funds remain on Solana. Destination liquidity is held on the retired EVM destination. Sepolia is used as the public proof surface that the retired proof middleware can read and verify.

## The banking analogy

When Bank A sends value to Bank B, the banks do not normally move the same physical cash through an intermediary. Bank A debits its customer or reserves an obligation, Bank B verifies the message and its settlement conditions, and Bank B credits the recipient from liquidity already available in its own system. The banks later reconcile their records and handle exceptions.

TSN follows the same separation:

| Banking function | TSN equivalent |
| --- | --- |
| Source bank authorizes an obligation | Mother authority accepts the TSN intent on Solana |
| Source bank reserves or holds value | Solana Epoch Treasury and its ledger |
| Payment instruction is authenticated | Canonical cross-domain commitment signed by the governed secp256k1 signer |
| Interbank message network carries the instruction | Relay or Cranker publishes the commitment to Sepolia |
| Receiving bank verifies the message | the retired proof middleware proves the Sepolia event; the retired EVM destination revalidates its fields |
| Receiving bank pays its customer | the retired EVM destination settlement contract pays from destination liquidity |
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

The original research checkpoint did not establish that each accepted intent was funded by a specifically linked treasury reservation. That relationship would need independent evidence before this proposed cross-network model could be presented as fully collateralized; current native funded-note credit uses its own contract.

### Sepolia: proof surface

Sepolia is not a custody network in this model. A commitment contract publishes a canonical settlement commitment after verifying the governed secp256k1 signature and nonce. The contract emits an event that the retired proof middleware can read and prove.

The relay only transports the signed commitment to the contract. It must not be able to change the settlement fields or create a valid commitment without the governed signer.

### Retired proof middleware: external-chain proof

The retired proof middleware supplied the proposed proof layer for the Sepolia event. Its documented USC model used attestation, Merkle inclusion, continuity and finality evidence. Such a proof could establish an event on the proof-surface chain; it would not independently prove TSN's Solana state or treasury funding.

The original plan excluded writability from its initial build. The middleware documentation then described writability as undergoing testing and audits, rather than as a substitute for liquidity. Even if available, writability would carry an authenticated message to a destination contract; the destination would still need its own liquidity to pay.

### Retired EVM destination: destination settlement

The retired EVM destination model required the proof middleware's result and validation of the complete settlement payload. Its destination contract requirements were:

- Proof validity and source transaction success.
- Commitment contract and event identity.
- Authorized signer and signature.
- Source and destination domains.
- Asset identifier and amount.
- Recipient and destination account.
- Epoch, intent, nonce, expiry, and status.
- Destination nullifier uniqueness.

The model permitted recipient credit from destination liquidity only after those checks passed.

## Trust and failure boundaries

The system has explicit trust roots rather than an implicit trusted bridge:

| Component | What it may do | What it must not be able to do |
| --- | --- | --- |
| Mother/governance authority | Authorize and rotate governed protocol keys | Allow an unregistered key to authorize settlement |
| Cross-domain secp256k1 signer | Sign canonical settlement commitments | Change a commitment after signing or sign outside its purpose policy |
| Node | Verify and prepare off-chain evidence | Create on-chain authorization or settlement authority |
| Receiver | Store and lease work | Change signed settlement terms |
| Cranker/relay | Submit or transport an already authorized payload | Substitute amount, recipient, asset, destination, or nonce |
| the retired proof middleware | Prove the Sepolia event and finality | Prove Solana semantics that were not included in the commitment |
| the retired EVM destination contract | Revalidate and settle against destination liquidity | Accept an unverified or replayed event |

Availability remains a separate concern from correctness. A malicious Node, Receiver, or relay may delay or censor work, but it should not be able to redirect funds. A compromised authorization key remains a material loss of authority, so registration, rotation, expiry, and emergency pause procedures are required.

## Why this is not an atomic bridge

The source-side and destination-side balances are not transferred in one atomic operation. Solana holds the source-side obligation and liquidity; the retired EVM destination pays from prefunded destination liquidity. This introduces operational requirements that a token bridge can sometimes avoid:

1. Destination liquidity must be funded before settlement.
2. Source and destination records must be reconciled.
3. Expired, rejected, and partially completed obligations need explicit states.
4. A reversal or reimbursement process is required for cross-domain failures.
5. Limits and risk controls must apply per asset, signer, epoch, and destination.

The correct product description is therefore “cryptographically authorized destination-side liquidity against a source-side obligation.” It should not be described as transporting stablecoins through the retired proof middleware.

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
  the retired proof middleware proves the Sepolia event and finality
      |
SETTLE
  the retired EVM destination verifies all fields, consumes the destination nullifier, and pays
      |
RECONCILE
  Source and destination receipts are matched; exceptions are recorded
```

Every transition should be idempotent and observable. A retry must either return the existing receipt or fail with a clear already-consumed, expired, invalid-proof, or insufficient-liquidity reason.

## Original research conclusions

- The correspondent-bank analogy is accurate when it is limited to prefunded destination liquidity and reconciliation.
- Solana can remain the source of funds and authorization while Sepolia is the proof surface.
- The retired proof middleware proves the Sepolia commitment event; it does not transport or custody money.
- The cross-domain secp256k1 signer is a new purpose-isolated trust root and must be governance-visible.
- The first useful implementation is readability-only: Solana authorization, Sepolia publication, the retired proof middleware proof, and the retired EVM destination settlement.
- Writability, direct Solana proof-middleware support, atomic liquidity movement and full reversal were later design directions, not prerequisites for the proposed initial demonstration.
