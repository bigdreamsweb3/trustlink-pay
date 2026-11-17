from server import runtime as server

def test_nested_private_openings_never_enter_execution_projection(self):
    for kind, value in [('TCAP_EPOCH_ACCOUNTING', {'assetEntry': 'asset', 'total': '100', 'proof': {'publicInputs': ['1'], 'proofA': 'a', 'proofB': 'b', 'proofC': 'c'}})]:
        private = {**value, 'amounts': [50, 50], 'sourceWallets': ['private'], 'blindings': ['secret']}
        if 'proof' in private:
            private['proof'] = {**private['proof'], 'openings': ['secret']}
        self.assertEqual(server._public_coordination(kind, private), value)
