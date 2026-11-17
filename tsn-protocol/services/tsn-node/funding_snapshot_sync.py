"""Reconstruct public funded-note membership from the chain-selected TCAP root.

No private openings are saved. Receipts provide append indices and commitments;
recomputed root/count equality, followed by a fresh chain read, selects authority.

Public export interface; implementations live in the named component packages.
"""
from __future__ import annotations
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
from settlement.funding.funded_leaf import funded_leaf
from settlement.witness.sparse_tree import SparseTree
from settlement.witness._read_snapshot import _read_snapshot
from settlement.witness.field import field
from settlement.witness.field_hex import field_hex
from settlement.witness.hex_field import hex_field
from settlement.funding.funding_contract import TCAP_PROGRAM
from settlement.funding.funding_contract import ROOT_SEED
from settlement.funding.funding_contract import MAX_LEAVES
from settlement.funding.funding_contract import MAX_SIGNATURES
from settlement.funding.funding_contract import FUNDING_ROOT_SPACE
from settlement.funding.funding_contract import FUNDING_HISTORY_CAPACITY
from settlement.funding.funding_contract import FUNDING_ROOT_CHANGED
from settlement.funding.funding_contract import FUNDING_ROOT_INVALID
from settlement.funding.funding_contract import Rpc
from settlement.funding.funding_root_address import funding_root_address
from settlement.funding._decode_funding_root import _decode_funding_root
from settlement.funding.decode_funding_root import decode_funding_root
from settlement.funding.select_funding_root import select_funding_root
from settlement.funding.read_funding_root import read_funding_root
from settlement.funding.decode_append_events import decode_append_events
from settlement.funding.validate_snapshot import validate_snapshot
from settlement.funding.publish_snapshot import publish_snapshot
from settlement.funding.select_base import select_base
from settlement.funding.ensure_funding_snapshot import ensure_funding_snapshot
from settlement.funding.funding_membership import funding_membership
