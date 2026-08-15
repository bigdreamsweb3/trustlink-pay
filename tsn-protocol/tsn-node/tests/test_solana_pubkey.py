import unittest

from nacl.bindings import crypto_core_ed25519_is_valid_point

from app.solana_pubkey import Pubkey


class SolanaPubkeyTests(unittest.TestCase):
    def test_system_program_round_trip(self):
        key = Pubkey.from_string("11111111111111111111111111111111")
        self.assertEqual(str(key), "11111111111111111111111111111111")
        self.assertEqual(len(bytes(key)), 32)

    def test_invalid_public_key_is_rejected(self):
        with self.assertRaises(ValueError):
            Pubkey.from_string("not-a-solana-public-key")

    def test_pda_is_off_curve_and_reproducible(self):
        program_id = Pubkey.from_string("11111111111111111111111111111111")
        seeds = [b"trustlink", b"test-pda"]
        address, bump = Pubkey.find_program_address(seeds, program_id)

        self.assertGreaterEqual(bump, 0)
        self.assertLessEqual(bump, 255)
        self.assertFalse(crypto_core_ed25519_is_valid_point(bytes(address)))
        self.assertEqual(
            address,
            Pubkey.create_program_address(seeds + [bytes([bump])], program_id),
        )


if __name__ == "__main__":
    unittest.main()
