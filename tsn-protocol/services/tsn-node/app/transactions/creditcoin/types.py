from __future__ import annotations

from .constants import CreditcoinNetwork
from dataclasses import dataclass
from .creditcoin_payout_authorization_post_init import __post_init__ as _CreditcoinPayoutAuthorization_post_init
from .creditcoin_payout_authorization_to_cranker_payload import to_cranker_payload as _CreditcoinPayoutAuthorization_to_cranker_payload

@dataclass(frozen=True)
class CreditcoinPayoutAuthorization:
    settlement_id: str
    route_id: str
    sealed_tip_head_hash: str
    tin_hash: str
    exit_commitment: str
    token: str
    destination_executor: str
    recipient: str
    amount_base_units: int
    fee_amount_base_units: int
    nonce: int
    deadline: int
    merchant_override: bool = False
    destination_network: CreditcoinNetwork = 'creditcoin-testnet'
    __post_init__ = _CreditcoinPayoutAuthorization_post_init
    to_cranker_payload = _CreditcoinPayoutAuthorization_to_cranker_payload
