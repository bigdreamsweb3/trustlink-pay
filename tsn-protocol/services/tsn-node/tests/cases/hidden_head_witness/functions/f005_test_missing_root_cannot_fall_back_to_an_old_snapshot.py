from hidden_head_witness import hex_field

def test_missing_root_cannot_fall_back_to_an_old_snapshot(self):
    with self.assertRaisesRegex(RuntimeError, 'chain-selected root'):
        self.prepare(old_root=hex_field(99))
