import unittest
from app.solana_pubkey import Pubkey
class SolanaPublicKeyTests(unittest.TestCase):
    def test_system_program_round_trip_preserves_exact_zero_encoding(self):
        address='1'*32
        self.assertEqual(str(Pubkey(bytes(32))),address)
        self.assertEqual(bytes(Pubkey.from_string(address)),bytes(32))
        for raw in (bytes(31)+b'\x01',b'\x00'+bytes([9])*31,bytes([255])*32):
            self.assertEqual(bytes(Pubkey.from_string(str(Pubkey(raw)))),raw)
        with self.assertRaises(ValueError):Pubkey.from_string('1'*33)
