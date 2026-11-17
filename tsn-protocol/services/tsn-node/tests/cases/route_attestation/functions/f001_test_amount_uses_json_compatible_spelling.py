from app.services.route_attestation import canonical_route_amount

def test_amount_uses_json_compatible_spelling(self):
    self.assertEqual(canonical_route_amount(1.0), '1')
    self.assertEqual(canonical_route_amount(10.0), '10')
    self.assertEqual(canonical_route_amount('1.2300'), '1.23')
    self.assertEqual(canonical_route_amount('1e-7'), '0.0000001')
