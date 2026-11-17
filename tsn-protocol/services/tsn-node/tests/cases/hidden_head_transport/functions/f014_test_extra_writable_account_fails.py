from fastapi import HTTPException

def test_extra_writable_account_fails(self):
    message = bytearray(self.message)
    message[3] -= 1
    with self.assertRaisesRegex(HTTPException, 'unexpected writable accounts'):
        self.verify(bytes(message))
