from fastapi import HTTPException

def test_memo_substitution_fails(self):
    message = bytearray(self.message)
    message[-1] = ord('A') if message[-1] != ord('A') else ord('B')
    with self.assertRaisesRegex(HTTPException, 'does not exactly match'):
        self.verify(bytes(message))
