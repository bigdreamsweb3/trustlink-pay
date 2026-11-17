"""verify_payment_authorization_from_signed_message_key: isolated helper; captured dependencies are explicit arguments."""
from __future__ import annotations
from datetime import datetime
from fastapi import HTTPException
from typing import Any
import json
import re
import time
from core.schemas.create_intent_request import CreateIntentRequest
from typing import Any, Protocol
class Dependencies(Protocol):
    _assert_canonical_nonce_unused: Any
    _assert_recipient_hash_matches_owner: Any
    _parse_canonical_expiry: Any
    _parse_canonical_message: Any
    _parse_usdc_base_units: Any
    _verify_ed25519_signature: Any
    read_onchain_tin_tip_route: Any
    resolve_tcap_registered_asset: Any
    resolve_tin_identity_for_verification: Any
    ui_amount_to_base_units: Any
    validate_funding_note: Any
    verify_destination_route: Any

def verify_payment_authorization_from_signed_message_key(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
