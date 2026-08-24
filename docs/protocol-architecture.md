# TSN protocol architecture

## Components

| Component | Responsibility |
| --- | --- |
| Device/SDK | Signs the sender authorization and the epoch-treasury funding transaction. It never exports private keys or Node encryption keys. |
| Receiver | Authenticated ingress and opaque work leases. It stores only an allowlisted public coordination record. It has no public settlement or refund ingress. |
| Node/Mother | Verifies funding and recipient authorization, stores the encrypted binding, derives the keyed slot, and signs short-lived DNA permits. |
| Cranker | Uses the permit to submit the TSN settlement transaction. It cannot choose a source account, payment record, recipient binding, amount, or reimbursement destination. |
| TSN program | Owns epoch treasury/ledger state, validates Mother-rooted permits, consumes slots/nullifiers, pays recipients, reimburses the exact vault, and processes refunds. |

## Lifecycle

1. Sender signs a canonical payment authorization. The SDK builds a `fund_epoch_treasury` transaction; no payment-specific account is included.
2. Node verifies the funding signature and stores the full binding encrypted off chain.
3. Node/Mother derives a keyed opaque slot and leases a Mother-rooted DNA to one operator. The Cranker receives only the opaque commitment and permit.
4. In the current TCAP credit path, the first valid ConfidentialSettlement authorization creates/consumes the receipt and advances the recipient tip. It does not invoke CrankerVault payout logic. Any CrankerVault settlement language elsewhere in this document is historical TSN payout architecture and is not normative for TCAP credit.
5. If the intent expires without settlement, Node/Mother signs a refund. The first valid refund initializes and consumes the same slot as `REFUNDED` and pays the authorized refund destination from epoch treasury.
6. Epoch close is permitted only after pending liability is zero and all slots are resolved.

The slot is not present in the funding transaction. No payment id, sender, recipient TIN, encrypted binding, or payment-specific PDA is written to the epoch ledger.
