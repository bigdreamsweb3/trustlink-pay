import copy
import hashlib
import json
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from pathlib import Path
from app.solana_pubkey import Pubkey, _encode_base58
from gpru_crypto import BABYJUB_BASE8, poseidon_v1
from hidden_head_witness import SparseTree, hex_field
from tip_snapshot_sync import TIP, ROUTE_ROOT, ROOT_BUMP, ensure_tip_snapshot, receipt_appends
from hidden_head_witness import SparseTree
from hidden_head_witness import hex_field
from cases.tip_snapshot_auto_sync.functions.f001_registry_fixture import registry_fixture

REGISTRIES = [registry_fixture(i) for i in range(3)]

ROOTS = [hex_field(SparseTree(32, dict(enumerate([r[2] for r in REGISTRIES[:count]]))).root) for count in (1, 2, 3)]
