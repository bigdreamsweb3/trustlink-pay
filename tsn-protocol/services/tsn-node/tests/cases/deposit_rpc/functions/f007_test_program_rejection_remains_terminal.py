

async def test_program_rejection_remains_terminal(self):
    with self.assertRaisesRegex(ValueError, 'Deployed TCAP program rejected'):
        await self.simulate([{'result': {'value': {'err': {'InstructionError': [0, 'Custom']}}}}])
