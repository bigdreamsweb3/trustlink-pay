from __future__ import annotations

from typing import Any

def to_cranker_payload(self, signature: str) -> dict[str, Any]:
    if not isinstance(signature, str) or not signature.startswith("0x"):
        raise ValueError("authorization signature is required")
    return {
        "destinationNetwork": self.destination_network,
        "authorization": {
            "settlementId": self.settlement_id,
            "routeId": self.route_id,
            "sourceNetwork": "solana-devnet",
            "sealedTipHeadHash": self.sealed_tip_head_hash,
            "tinHash": self.tin_hash,
            "exitCommitment": self.exit_commitment,
            "destinationNetwork": self.destination_network,
            "destinationExecutor": self.destination_executor,
            "token": self.token,
            "recipient": self.recipient,
            "amount": str(self.amount_base_units),
            "feeAmount": str(self.fee_amount_base_units),
            "nonce": str(self.nonce),
            "deadline": str(self.deadline),
            "merchantOverride": self.merchant_override,
        },
        "signature": signature,
    }
