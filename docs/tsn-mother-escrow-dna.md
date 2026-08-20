# TSN private settlement: Mother-authorized DNA and opaque epoch slots

Funding sends SPL tokens directly to the current epoch's treasury token account.  The funding transaction creates no payment escrow, commitment PDA, payment vault, or claim slot.  It only increases the epoch's aggregate pending liability.

The Node/Mother stores the full payment binding as an encrypted off-chain record.  It includes the payment identifier, funding lineage, sender refund destination, recipient route binding, amount, mint, and epoch.  Its encryption key never leaves Node/Mother.  The Cranker never receives this record, a private escrow address, a record PDA, or a funding-account secret.

For a confirmed intent, Node derives an opaque deterministic slot with HMAC-SHA256 over the payment binding using `TSN_NODE_CLAIM_SLOT_HMAC_SECRET`.  The slot is deliberately absent from funding.  Node then signs a short-lived Mother-authorized DNA permit binding the slot, commitment digest, nullifier, selected Cranker vault, recipient, mint, amount, and lease ID/version/expiry.

Mother authority materializes the one-time `SettlementDna` PDA at the derived slot plus lease version.  The PDA is the on-chain voucher; it is not a payment escrow and contains no sender/payment identifier.  Only the Mother authority can create it, and the TSN program consumes it on the first valid settlement or refund.

The Cranker receives only the opaque slot/DNA, Node permit, nullifier, recipient coordinates, mint, amount, its vault, and lease data.  Its settlement transaction calls TSN with those values.  TSN verifies the Ed25519 permit and lease, derives the slot account from the epoch treasury and opaque slot, and creates that account only if it does not already exist.  It then transfers the payout from the Cranker vault, marks the slot `SETTLED`, and permanently records the settling Cranker/vault as the reimbursement owner.

If a valid settlement never occurs, Mother/Node issues a refund permit for the same opaque slot.  The refund transaction creates the same slot account and marks it `REFUNDED` while returning the exact amount from the epoch treasury to the sender's ATA.  The account creation/write lock makes settlement and refund mutually exclusive: the first valid transaction wins atomically and the other fails before any transfer.

Settlement reimburses the recorded Cranker vault from the epoch treasury in the same atomic payout instruction.  The reimbursement is bound to the exact slot, settlement commitment, amount, mint, vault, and settling Cranker; there is no aggregate or caller-selected reimbursement instruction.  The epoch treasury closes only after pending liability is zero, every resolved amount is accounted as settled or refunded, and all settled reimbursements have completed.

This is an attested capability design, not a ZK proof system.  Privacy comes from keeping the payment binding encrypted off-chain and ensuring the opaque slot first appears only at settlement or refund, never at funding.
