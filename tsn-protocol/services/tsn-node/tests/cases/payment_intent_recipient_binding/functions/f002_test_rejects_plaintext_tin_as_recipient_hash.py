from fastapi import HTTPException
from server import _assert_recipient_hash_matches_owner

def test_rejects_plaintext_tin_as_recipient_hash(self):
    with self.assertRaisesRegex(HTTPException, '32-byte hexadecimal owner hash'):
        _assert_recipient_hash_matches_owner('1234567890', 'ab' * 32)
