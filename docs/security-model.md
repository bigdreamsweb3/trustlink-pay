# TSN security model

| Boundary | Allowed data | Forbidden data |
| --- | --- | --- |
| Device → Node | Sender-signed authorization, funding signature, public routing coordinates | Private keys, master seeds, snapshot decryption keys |
| Receiver → Cranker | Opaque intent work, lease, public coordination fields | Recipient TIN, sender authorization, serialized funding transaction, encrypted binding |
| Node/Mother → Cranker | Opaque slot/commitment, nullifier, public payout coordinates, short-lived signed permit | Payment id, encrypted record, refund secret, payment-specific account |
| Cranker → TSN | Permit and public accounts required by the bound instruction | Caller-selected source, payment record, alternate vault, alternate amount/recipient |

The current TCAP credit path verifies the Mother-rooted ConfidentialSettlement receipt, AcceptedIntent binding, lease/validity window, amount, token, recipient tip, commitments, sequence and nullifier. It atomically advances the tip and consumes the receipt/nullifier; replay fails. It does not pay from CrankerVault. CrankerVault payout and reimbursement descriptions are retained only for historical TSN payout instructions and must not be used to implement TCAP credit.

The model provides capability-based authorization and opaque commitment coordination. TCAP private reads use owner-local decryption; this is not a formal zero-knowledge proof system.
