from __future__ import annotations

from ._bytes32 import _bytes32
from ._evm_address import _evm_address

def __post_init__(self) -> None:
    object.__setattr__(self, "settlement_id", _bytes32(self.settlement_id, "settlement_id"))
    object.__setattr__(self, "sealed_tip_head_hash", _bytes32(self.sealed_tip_head_hash, "sealed_tip_head_hash"))
    object.__setattr__(self, "tin_hash", _bytes32(self.tin_hash, "tin_hash"))
    object.__setattr__(self, "exit_commitment", _bytes32(self.exit_commitment, "exit_commitment"))
    object.__setattr__(self, "recipient", _evm_address(self.recipient))
    object.__setattr__(self, "token", _evm_address(self.token))
    if self.destination_network not in {"creditcoin-testnet", "base", "ethereum"}:
        raise ValueError("destination network is not supported")
    object.__setattr__(self, "route_id", _bytes32(self.route_id, "route_id"))
    object.__setattr__(self, "destination_executor", _evm_address(self.destination_executor))
    if self.amount_base_units <= 0 or self.fee_amount_base_units < 0 or self.nonce < 0 or self.deadline <= 0:
        raise ValueError("invalid Creditcoin payout numeric field")
