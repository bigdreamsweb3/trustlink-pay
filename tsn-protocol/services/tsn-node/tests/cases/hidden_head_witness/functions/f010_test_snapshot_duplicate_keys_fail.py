

def test_snapshot_duplicate_keys_fail(self):
    self.state_path.write_text('{"version":1,"heads":{},"heads":{},"nullifiers":[]}')
    with self.assertRaisesRegex(ValueError, 'duplicate keys'):
        self.prepare()
