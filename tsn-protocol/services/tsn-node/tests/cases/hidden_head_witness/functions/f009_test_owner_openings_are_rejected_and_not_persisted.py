import json

def test_owner_openings_are_rejected_and_not_persisted(self):
    self.state_path.write_text(json.dumps({'version': 1, 'heads': {}, 'nullifiers': [], 'predecessorBalance': '100'}))
    with self.assertRaisesRegex(ValueError, 'unsupported field set'):
        self.prepare()
