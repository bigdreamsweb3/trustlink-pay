"""Circuit tools facade for the canonical Node debit preparer."""
import sys
from pathlib import Path
NODE_ROOT = Path(__file__).resolve().parents[5] / "services" / "tsn-node"
if str(NODE_ROOT) not in sys.path:
    sys.path.insert(0, str(NODE_ROOT))
from nacl.exceptions import BadSignatureError
from nacl.secret import SecretBox
from nacl.signing import VerifyKey
from security.cryptography._babyjub_add import _babyjub_add
from security.cryptography._babyjub_mul import _babyjub_mul
from security.cryptography.derive_node_record_shared_point import derive_node_record_shared_point
from security.cryptography.encrypt_balance_blinding_delta_v1 import encrypt_balance_blinding_delta_v1
from security.cryptography.gpru_contract import BABYJUB_BASE8
from security.cryptography.gpru_contract import BABYJUB_FIELD
from security.cryptography.gpru_contract import BABYJUB_SUBORDER
from security.cryptography.poseidon_v1 import poseidon_v1
from settlement.witness._point import _point
from settlement.witness._portfolio import _portfolio
from settlement.witness.hex_field import hex_field
from settlement.witness.path_root import path_root
from settlement.witness.sparse_tree import SparseTree
from settlement.witness.witness_contract import BALANCE_H
from transactions.records._ledger_memo_payload_v1 import _ledger_memo_payload_v1
from transactions.records._sha256_to_bn254_scalar_hex import _sha256_to_bn254_scalar_hex
from typing import Any
import base64
import copy
import hashlib
import re
import secrets
from settlement.debit.preparation.contract import MAX_U64, MAX_BALANCE, ACTION_KIND, VALUE_DOMAIN, NULLIFIER_DOMAIN, AUTH_DOMAIN, CONTEXT_DOMAIN, SIGNATURE_DOMAIN, PUBLIC_FIELDS, RESERVE_CATEGORIES, BABYJUB_SUBORDER, OPENING_DOMAIN, OPENING_FIELDS, OPENING_TAG
from settlement.debit.preparation.scalar import scalar
from settlement.debit.preparation.hex_scalar import hex_scalar
from settlement.debit.preparation.uint import uint
from settlement.debit.preparation.route_fields import route_fields
from settlement.debit.preparation.balance_point import balance_point
from settlement.debit.preparation.commitments import commitments
from settlement.debit.preparation.approval_message import approval_message
from settlement.debit.preparation.verify_approval import verify_approval
from settlement.debit.preparation.state_trees import state_trees
from settlement.debit.preparation.prepare_tin_debit import prepare_tin_debit
