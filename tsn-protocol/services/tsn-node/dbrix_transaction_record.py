"""DBrix-compatible encrypted GPRU balance-action records and Ledger Memos.

Public export interface; implementations live in the named component packages.
"""
from __future__ import annotations
import base64
import hashlib
import json
import secrets
import zlib
from typing import Any
from nacl.secret import SecretBox
from transactions.records.record_contract import ACTION_KINDS
from transactions.records.record_contract import BABYJUB_SUBORDER
from transactions.records.record_contract import BN254_SCALAR_MODULUS
from transactions.records.record_contract import ZERO_COMMITMENT
from transactions.records._sha256_to_bn254_scalar_hex import _sha256_to_bn254_scalar_hex
from transactions.records._ledger_memo_payload_v1 import _ledger_memo_payload_v1
from transactions.records._validate_balance_action_record_v1 import _validate_balance_action_record_v1
from transactions.records.encrypt_transaction_record_v1 import encrypt_transaction_record_v1
from transactions.records.validate_transaction_record_v1 import validate_transaction_record_v1
