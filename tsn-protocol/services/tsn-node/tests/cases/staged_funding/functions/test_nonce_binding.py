import asyncio
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import AsyncMock
from types import SimpleNamespace
from app.store import FileStore
from verification.intent.assert_canonical_nonce_unused import _assert_canonical_nonce_unused
from fastapi import HTTPException


async def test_nonce_binding(self):
    with TemporaryDirectory() as directory:
        store = FileStore(Path(directory) / 'state.json')
        port = SimpleNamespace(get_mempool_store=AsyncMock(return_value=store), k_canonical_message_nonces=str)
        args = {'action': 'Payment Intent', 'authorization_domain': 'TSN', 'sender_public_key': self.wallet,
                'nonce': 'same-nonce', 'work_id': 'same-work', 'authorization_payload_commitment': '22' * 32}
        await asyncio.gather(*(_assert_canonical_nonce_unused(port, **args) for _ in range(16)))
        with self.assertRaises(HTTPException):
            await _assert_canonical_nonce_unused(port, **{**args, 'work_id': 'different-work'})
        with self.assertRaises(HTTPException):
            await _assert_canonical_nonce_unused(port, **{**args, 'authorization_payload_commitment': '33' * 32})
        self.assertEqual(await store.hlen(''), 1)
