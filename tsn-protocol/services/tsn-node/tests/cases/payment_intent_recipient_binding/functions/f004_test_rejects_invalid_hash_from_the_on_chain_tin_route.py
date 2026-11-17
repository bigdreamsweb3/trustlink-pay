from fastapi import HTTPException
from server import _assert_recipient_hash_matches_owner

def test_rejects_invalid_hash_from_the_on_chain_tin_route(self):
    with self.assertRaisesRegex(HTTPException, 'TIP route has an invalid owner hash'):
        _assert_recipient_hash_matches_owner('ab' * 32, 'not-a-hash')
