# TSN private settlement architecture

TSN uses an epoch treasury and opaque, keyed settlement slots. Funding sends tokens only to the epoch treasury token account and increments aggregate pending liability. Funding creates no payment account, escrow account, commitment PDA, or public payment identifier.

The Node/Mother keeps the payment binding (recipient route, sender refund destination, funding lineage, amount, mint, epoch, and payment hash) in encrypted storage. The encryption key and plaintext never leave Node/Mother. A keyed slot is derived by authorized Node/Mother with HMAC-SHA256 and is withheld until settlement or refund.

## Mother-rooted DNA

For a lease, Node signs a permit binding the opaque slot, commitment digest, random nonce, nullifier, Mother-rooted epoch treasury and ledger, CrankerVault, recipient, mint, amount, lease id/version/expiry, and authorization expiry. The `EpochClaimSlot` PDA is derived from the epoch treasury and opaque slot. It is initialized by the first valid settlement or refund, so the slot first appears on chain at that operation. It stores no payment id, sender, or recipient identity beyond the public payout coordinate required by the transfer.

The first successful operation wins. Settlement atomically checks the Node permit, lease, slot state, nullifier, and treasury liability; pays the recipient from the CrankerVault; reimburses that exact CrankerVault for the exact amount; marks the slot `SETTLED`; and records the successful Cranker. Refund uses the same slot and marks it `REFUNDED`, returning the exact amount from epoch treasury to the Node-authorized refund destination. A later operation against the same slot fails before token movement.

Crankers receive only the opaque settlement commitment, nullifier, lease data, public recipient coordinates, amount, mint, vault, and signed permit. They never receive the encrypted record, a payment-specific escrow account, or a payment record PDA. The public transaction exposes only the opaque slot/commitment and the public settlement coordinates.

An epoch can close only when pending liability is zero and every slot is resolved. This is Node/Mother attestation and one-time capability consumption, not a zero-knowledge proof.
