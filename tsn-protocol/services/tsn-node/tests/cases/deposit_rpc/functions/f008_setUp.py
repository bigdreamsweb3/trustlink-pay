from app.solana_pubkey import Pubkey
from cases.wallet_funding_transaction.functions.f004_fixture import fixture
from cases.wallet_funding_transaction.functions.f003_signed_wire import signed_wire


def setUp(self):
    key, deposit, _, _ = fixture()
    self.wire, _ = signed_wire([deposit], key)
    self.blockhash_context = {"blockhash": str(Pubkey(bytes([99]) * 32)), "lastValidBlockHeight": 1000, "contextSlot": 123}
