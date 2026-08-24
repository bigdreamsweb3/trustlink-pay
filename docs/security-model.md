# TSN security model

| Boundary | Allowed data | Forbidden data |
| --- | --- | --- |
| Device → Node | Sender-signed authorization, funding signature, public routing coordinates | Private keys, master seeds, snapshot decryption keys |
| Receiver → Cranker | Opaque intent work, lease, public coordination fields | Recipient TIN, sender authorization, serialized funding transaction, encrypted binding |
| Node/Mother → Cranker | Opaque slot/commitment, nullifier, public payout coordinates, short-lived signed permit | Payment id, encrypted record, refund secret, payment-specific account |
| Cranker → TSN | Permit and public accounts required by the bound instruction | Caller-selected source, payment record, alternate vault, alternate amount/recipient |

The TSN program verifies the Mother-rooted permit, lease expiry, slot PDA, nullifier, amount, mint, recipient and CrankerVault. It atomically records `SETTLED` or `REFUNDED`; a second operation against the slot fails. Settlement pays from CrankerVault and reimburses that exact vault from epoch treasury in the same instruction. Refund pays from epoch treasury only after Node/Mother authorization.

The model provides capability-based authorization and opaque commitment coordination. TCAP private reads use owner-local decryption; this is not a formal zero-knowledge proof system.
