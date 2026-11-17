from fastapi import HTTPException
from server import _assert_recipient_hash_matches_owner

def test_rejects_an_unrelated_32_byte_hash(self):
    with self.assertRaisesRegex(HTTPException, 'does not match the Node-resolved TIN owner hash'):
        _assert_recipient_hash_matches_owner('cd' * 32, 'ab' * 32)
