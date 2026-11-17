from server import runtime as server

def test_rejects_extra_token_system_memo_and_other_tcap_actions(self):
    for program in ('11111111111111111111111111111111', self.context['depositAccounts']['tokenProgram'], 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', server.TCAP_PROGRAM_ID):
        with self.subTest(program=program), self.assertRaisesRegex(ValueError, 'unsupported additional'):
            self.verify([self.deposit, (program, [], b'unexpected-action')])
