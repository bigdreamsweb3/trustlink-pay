

async def test_cold_node_rebuilds_direct_and_staged_creations_in_append_order(self):
    await self.sync()
    self.assert_current_snapshot()
