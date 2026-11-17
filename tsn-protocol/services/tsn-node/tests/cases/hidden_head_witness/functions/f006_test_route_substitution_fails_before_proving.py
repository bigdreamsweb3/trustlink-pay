from hidden_head_witness import hex_field

def test_route_substitution_fails_before_proving(self):
    route = {**self.route, 'gpruElgamalKeyCommitment': hex_field(1)}
    with self.assertRaisesRegex(ValueError, 'uniquely resolved recipient'):
        self.prepare(route=route)
