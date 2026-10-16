import unittest

from fastapi import HTTPException

from server import _assert_recipient_hash_matches_owner


class PaymentIntentRecipientBindingTests(unittest.TestCase):
    def test_accepts_the_node_resolved_owner_hash_case_insensitively(self):
        owner_hash = "ab" * 32
        _assert_recipient_hash_matches_owner(owner_hash.upper(), owner_hash)

    def test_rejects_plaintext_tin_as_recipient_hash(self):
        with self.assertRaisesRegex(HTTPException, "32-byte hexadecimal owner hash"):
            _assert_recipient_hash_matches_owner("1234567890", "ab" * 32)

    def test_rejects_an_unrelated_32_byte_hash(self):
        with self.assertRaisesRegex(HTTPException, "does not match the Node-resolved TIN owner hash"):
            _assert_recipient_hash_matches_owner("cd" * 32, "ab" * 32)

    def test_rejects_invalid_hash_from_the_on_chain_tin_route(self):
        with self.assertRaisesRegex(HTTPException, "TIN route has an invalid owner hash"):
            _assert_recipient_hash_matches_owner("ab" * 32, "not-a-hash")


if __name__ == "__main__":
    unittest.main()
