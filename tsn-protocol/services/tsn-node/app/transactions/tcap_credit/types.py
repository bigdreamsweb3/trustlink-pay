from __future__ import annotations

from dataclasses import dataclass
from .tcap_credit_authorization_v2_post_init import __post_init__ as _TcapCreditAuthorizationV2_post_init
from .tcap_credit_authorization_v2_instruction_fields import instruction_fields as _TcapCreditAuthorizationV2_instruction_fields

@dataclass(frozen=True)
class TcapCreditAuthorizationV2:
    tip: str
    previous_commitment: str
    new_commitment: str
    sequence: int
    token_id: int
    policy_commitment: str
    gpru_scope_commitment: str
    nullifier: str
    valid_after_slot: int
    expires_at_slot: int
    authorization_digest: str
    __post_init__ = _TcapCreditAuthorizationV2_post_init
    instruction_fields = _TcapCreditAuthorizationV2_instruction_fields
