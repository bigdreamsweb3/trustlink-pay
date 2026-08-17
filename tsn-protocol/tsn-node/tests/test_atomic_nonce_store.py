import asyncio
import sys
import types
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

try:
    import httpx  # type: ignore  # noqa: F401
except ModuleNotFoundError:
    # The FileStore test does not exercise the HTTP adapter.
    sys.modules["httpx"] = types.ModuleType("httpx")

from app.store import FileStore


class AtomicNonceStoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_concurrent_consume_once_has_one_winner(self):
        with TemporaryDirectory() as directory:
            store = FileStore(Path(directory) / "state.json")
            results = await asyncio.gather(*(
                store.consume_once(
                    "tsn:canonical_message_nonces",
                    "domain-action-sender-nonce",
                    '{"domain":"TSN","action":"Payment Intent"}',
                )
                for _ in range(32)
            ))

            self.assertEqual(sum(results), 1)


if __name__ == "__main__":
    unittest.main()
