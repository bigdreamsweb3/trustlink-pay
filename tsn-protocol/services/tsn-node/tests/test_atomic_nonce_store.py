import asyncio
import sys
import types
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from cases.atomic_nonce_store import data as _fixture_data
from app.store import FileStore
from cases.atomic_nonce_store.functions.f001_test_concurrent_consume_once_has_one_winner import test_concurrent_consume_once_has_one_winner as _case_f001_test_concurrent_consume_once_has_one_winner

class AtomicNonceStoreTests(unittest.IsolatedAsyncioTestCase):
    test_concurrent_consume_once_has_one_winner = _case_f001_test_concurrent_consume_once_has_one_winner
if __name__ == '__main__':
    unittest.main()
