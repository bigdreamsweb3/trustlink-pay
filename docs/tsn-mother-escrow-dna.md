# TSN escrow DNA settlement

Private settlement uses an escrow-specific, opaque DNA voucher. The Node and
Mother Escrow witnesses verify the payment privately, then derive one DNA PDA
from `payment_id_hash` and a second hash of the private commitment. The raw
commitment, sender intent PDA, escrow token account, and `PrivateEscrowRecord`
never enter the Cranker authorization or the payout transaction.

The authorization contains only the DNA PDA, the commitment digest, a random
nonce, recipient/vault/mint/amount coordinates, a payout nullifier, and the
short lease binding. The Node atomically consumes its authorization key before
signing, so concurrent requests cannot create two live authorizations for the
same payment. The signed permit is verified by the TSN program and commits all
of those fields. The program also recomputes the settlement commitment from
the DNA PDA and public coordinates.

The first successful `tsn_execute_private_payout` call creates/updates the
DNA account, verifies the Node/Mother permit, transfers tokens only from the
authorized CrankerVault to the canonical recipient ATA, and marks the DNA
consumed forever. A second call, a wrong vault, changed recipient or amount,
an expired lease, or a mismatched digest fails before token movement. The
consumed DNA records the exact CrankerVault, Cranker, amount, and nullifier.

Epoch settlement invokes `tsn_settle_private_dna_reimbursement`. Only Mother
Escrow authority may call it; it transfers the recorded amount from the TSN
treasury token account back to the exact vault and marks the DNA reimbursed.
This is the permanent reimbursement/claim record for the Cranker that fronted
the payout.

This is Node/Mother-attested capability authorization, not zero-knowledge. The
on-chain privacy property is that observers see only a commitment digest and
settlement coordinates; the underlying sender escrow lineage remains off-chain
and is not an account meta of the payout instruction.
