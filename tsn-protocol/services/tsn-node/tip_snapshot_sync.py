"""Reconstruct TIP membership witnesses from confirmed, indexed creation history.

Only commitments are stored. Chain root/count equality selects every snapshot;
this module never authorizes work, decrypts owner data or submits transactions.

Public export interface; implementations live in the named component packages.
"""
from __future__ import annotations
import asyncio
import base64
import hashlib
import json
import os
import re
import secrets
from pathlib import Path
from typing import Any
from typing import Awaitable
from typing import Callable
from app.solana_pubkey import Pubkey
from app.solana_pubkey import _decode_base58
from security.cryptography.gpru_contract import BABYJUB_FIELD
from security.cryptography.poseidon_v1 import poseidon_v1
from settlement.witness.sparse_tree import SparseTree
from settlement.witness._point import _point
from settlement.witness._read_snapshot import _read_snapshot
from settlement.witness.field import field
from settlement.witness.field_hex import field_hex
from settlement.witness.hex_field import hex_field
from settlement.tip.tip_contract import TIP
from settlement.tip.tip_contract import ROUTE_ROOT
from settlement.tip.tip_contract import ROOT_BUMP
from settlement.tip.tip_contract import MAX_ROUTES
from settlement.tip.tip_contract import Rpc
from settlement.tip.decode_registry import decode_registry
from settlement.tip.decode_root import decode_root
from settlement.tip.extend_snapshot import extend_snapshot
from settlement.tip.publish import publish
from settlement.tip.validate_snapshot import validate_snapshot
from settlement.tip.select_base import select_base
from settlement.tip.receipt_appends import receipt_appends
from settlement.tip.read_accounts import read_accounts
from settlement.tip.ensure_tip_snapshot import ensure_tip_snapshot
