from server import runtime as server

async def test_funding_root_change_or_empty_tree_fails(self):
    for change in ({'root': (bytes([3]) * 32).hex()}, {'count': 0}, {'address': str(self.asset)}):
        with self.subTest(change=change):
            original = self.funding_state.copy()
            self.funding_state.update(change)
            reason = server.FUNDING_ROOT_CHANGED if 'root' in change else server.FUNDING_ROOT_INVALID
            with self.assertRaisesRegex(ValueError, reason):
                await self.check()
            self.funding_state = original
