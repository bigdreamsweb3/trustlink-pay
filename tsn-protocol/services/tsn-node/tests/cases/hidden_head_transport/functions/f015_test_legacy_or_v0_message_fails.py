

def test_legacy_or_v0_message_fails(self):
    for version in (2, 128):
        with self.subTest(version=version):
            with self.assertRaisesRegex(ValueError, 'only Solana v1'):
                self.verify(bytes([version]) + self.message[1:])
