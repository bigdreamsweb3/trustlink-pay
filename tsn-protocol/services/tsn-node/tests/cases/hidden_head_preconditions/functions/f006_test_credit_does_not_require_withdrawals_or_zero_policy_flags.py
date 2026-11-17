

async def test_credit_does_not_require_withdrawals_or_zero_policy_flags(self):
    for overrides in ({'withdrawals_enabled': 0}, {'withdrawals_enabled': 1}, {'transfer_fee_policy': 0, 'freeze_authority_policy': 0, 'issuer_control_policy': 0}):
        with self.subTest(overrides=overrides):
            self.records[2] = self.asset_entry(**overrides)
            await self.check()
