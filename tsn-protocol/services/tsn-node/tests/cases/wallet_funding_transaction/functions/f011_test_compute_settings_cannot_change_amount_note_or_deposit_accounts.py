from app.solana_pubkey import Pubkey
from cases.wallet_funding_transaction.functions.f002_compute import compute
import copy

def test_compute_settings_cannot_change_amount_note_or_deposit_accounts(self):
    for field, changed in (('depositAmountBaseUnits', '1000001'), ('fundingNoteCommitment', '01' * 32)):
        context = {**self.context, field: changed}
        with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'exact TCAP private'):
            self.verify([compute(2, 300000), self.deposit], context)
    for name in ('assetEntry', 'reserveState', 'source', 'vault', 'mint', 'tokenProgram', 'fundingRootAccount'):
        context = copy.deepcopy(self.context)
        context['depositAccounts'][name] = str(Pubkey(bytes([89]) * 32))
        with self.subTest(account=name), self.assertRaisesRegex(ValueError, 'exact TCAP private'):
            self.verify([self.deposit, compute(3, 1000)], context)
