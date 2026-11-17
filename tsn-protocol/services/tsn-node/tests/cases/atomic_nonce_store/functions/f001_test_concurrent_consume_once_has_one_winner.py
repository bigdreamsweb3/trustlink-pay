from app.store import FileStore
from pathlib import Path
from tempfile import TemporaryDirectory
import asyncio

async def test_concurrent_consume_once_has_one_winner(self):
    with TemporaryDirectory() as directory:
        store = FileStore(Path(directory) / 'state.json')
        results = await asyncio.gather(*(store.consume_once('tsn:canonical_message_nonces', 'domain-action-sender-nonce', '{"domain":"TSN","action":"Payment Intent"}') for _ in range(32)))
        self.assertEqual(sum(results), 1)
