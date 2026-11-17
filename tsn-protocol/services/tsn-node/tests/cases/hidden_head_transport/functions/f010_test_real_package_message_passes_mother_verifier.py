from app.solana_pubkey import Pubkey

def test_real_package_message_passes_mother_verifier(self):
    self.assertEqual(self.verify(), bytes(Pubkey.from_string(self.blockhash)))
