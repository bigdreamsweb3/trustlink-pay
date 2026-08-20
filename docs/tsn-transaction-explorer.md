# TSN transaction explorer privacy model

Funding transactions contain only the sender, mint, amount, current epoch treasury, and aggregate ledger update. The first public appearance of a payment-specific value is the opaque keyed slot in a settlement or refund transaction.

Settlement transactions contain the opaque slot/commitment, nullifier, Mother-rooted permit, CrankerVault, recipient token account, mint, amount, lease data, and the TSN program instruction. They do not contain a payment-specific source account, payment record PDA, payment id, or recipient TIN. The program consumes the slot and records only opaque state plus the public payout coordinate needed for token movement.

Refund transactions use the same slot. `SETTLED` and `REFUNDED` are mutually exclusive; the first valid transaction wins atomically. Observers can see that a slot was resolved and the public settlement amount/recipient, but cannot link it to an earlier funding transaction from a payment-specific account.
