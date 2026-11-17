import base64
import copy
import hashlib
import unittest
from unittest.mock import AsyncMock, Mock, patch
from nacl.signing import SigningKey
from server import runtime as server
from app.solana_pubkey import Pubkey, _encode_base58
from funding_note import funding_nullifier
from funding_snapshot_sync import funding_root_address
from test_funding_note import note

COMPUTE_PROGRAM = 'ComputeBudget111111111111111111111111111111'
