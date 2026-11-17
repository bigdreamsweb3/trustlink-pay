"""Untrusted, root-addressed snapshots for TCAP's hidden authenticated maps.

Snapshots contain commitments and points, never owner balance openings. Only
the root read from TCAP selects a snapshot; saving a candidate advances no state.

Public export interface; implementations live in the named component packages.
"""
from __future__ import annotations
import json
import os
import re
import secrets
from pathlib import Path
from typing import Any
from security.cryptography.gpru_contract import BABYJUB_FIELD
from security.cryptography.gpru_contract import BABYJUB_SUBORDER
from security.cryptography.gpru_contract import BABYJUB_BASE8
from security.cryptography._babyjub_add import _babyjub_add
from security.cryptography._babyjub_mul import _babyjub_mul
from security.cryptography.encrypt_balance_blinding_delta_v1 import encrypt_balance_blinding_delta_v1
from security.cryptography.poseidon_v1 import poseidon_v1
from settlement.witness.witness_contract import BALANCE_H
from settlement.witness.field import field
from settlement.witness.field_hex import field_hex
from settlement.witness.hex_field import hex_field
from settlement.witness.sparse_tree import SparseTree
from settlement.witness.path_root import path_root
from settlement.witness._point import _point
from settlement.witness._portfolio import _portfolio
from settlement.witness._read_snapshot import _read_snapshot
from settlement.witness.hidden_head_witness_store import HiddenHeadWitnessStore
