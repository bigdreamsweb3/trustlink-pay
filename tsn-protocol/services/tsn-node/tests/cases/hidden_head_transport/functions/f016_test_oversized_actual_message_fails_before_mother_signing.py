from fastapi import HTTPException

# The second instruction header carries the Memo's u16 data length.
def test_oversized_actual_message_fails_before_mother_signing(self):
    message = bytearray(self.message)
    extra = 4097 - self.transport['wireBytes']
    length_offset = 42 + self.transport['accountCount'] * 32 + 8 + 4 + 2
    length = int.from_bytes(message[length_offset:length_offset + 2], 'little')
    message[length_offset:length_offset + 2] = (length + extra).to_bytes(2, 'little')
    message.extend(b'A' * extra)
    with self.assertRaisesRegex(HTTPException, 'v1 4096-byte limit'):
        self.verify(bytes(message))
