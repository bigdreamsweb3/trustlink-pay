import json

def test_tampered_tip_path_does_not_match_chain(self):
    document = json.loads(self.tip_path.read_text())
    document['leaves'].append('99')
    self.tip_path.write_text(json.dumps(document))
    with self.assertRaisesRegex(ValueError, 'on-chain route root'):
        self.prepare()
