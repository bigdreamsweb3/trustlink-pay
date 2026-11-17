

async def test_pending_reclassification_does_not_gate_an_individual_credit(self):
    self.records[3][148:156] = 499 .to_bytes(8, 'little')
    await self.check()
