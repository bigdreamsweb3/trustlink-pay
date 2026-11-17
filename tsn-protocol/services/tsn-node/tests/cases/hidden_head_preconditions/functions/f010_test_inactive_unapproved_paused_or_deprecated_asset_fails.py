

async def test_inactive_unapproved_paused_or_deprecated_asset_fails(self):
    for overrides in [{'status': status} for status in (0, 2, 3, 4)] + [{'risk_state': risk} for risk in (0, 2, 3)] + [{'paused': 1}, {'deprecated': 1}]:
        with self.subTest(overrides=overrides):
            self.records[2] = self.asset_entry(**overrides)
            with self.assertRaisesRegex(ValueError, 'unavailable|reserve binding'):
                await self.check()
