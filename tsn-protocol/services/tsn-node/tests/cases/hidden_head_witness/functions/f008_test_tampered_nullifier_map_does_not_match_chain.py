from hidden_head_witness import hex_field
import json

def test_tampered_nullifier_map_does_not_match_chain(self):
    self.state_path.write_text(json.dumps({'version': 1, 'heads': {}, 'nullifiers': [hex_field(12)]}))
    with self.assertRaisesRegex(ValueError, 'on-chain shared root'):
        self.prepare()
