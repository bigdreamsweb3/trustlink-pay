import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from gpru_crypto import poseidon_v1
from hidden_head_witness import SparseTree, hex_field
from cases.tip_snapshot_sync.origin import SOURCE_FILE as __file__

ROOT = Path(__file__).resolve().parents[4]

spec = importlib.util.spec_from_file_location('tip_snapshot_sync', ROOT / 'scripts/sync-tip-witness.py')

sync = importlib.util.module_from_spec(spec)

spec.loader.exec_module(sync)
