"""sign_settlement_transaction_key: isolated helper; captured dependencies are explicit arguments."""
from __future__ import annotations
from fastapi import Depends
from fastapi import HTTPException
from typing import Any
import base64
import binascii
from typing import Any, Protocol
class Dependencies(Protocol):
    _assert_current_settlement_lease: Any
    _assert_mother_authority_key_matches_chain: Any
    _assert_unsigned_native_settlement: Any
    _mother_authority_signing_key: Any
    _native_blockhash_lifetime: Any
    _receiver_work_by_id: Any
    _verify_mother_signed_tcap_settlement_message: Any
    _verify_private_coordination_message: Any
    create_settlement_authorization: Any
    solana_rpc: Any

def sign_settlement_transaction_key(current_kind, node, operator, authority, transition, candidate):
    return node._verify_mother_signed_tcap_settlement_message(candidate, operator=operator, authority=authority, transition=transition) if current_kind == 'SETTLEMENT' else node._verify_private_coordination_message(candidate, operator, authority, current_kind, transition)
