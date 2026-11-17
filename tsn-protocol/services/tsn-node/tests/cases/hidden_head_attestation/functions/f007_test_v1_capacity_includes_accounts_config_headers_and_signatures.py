from server import runtime as server

def test_v1_capacity_includes_accounts_config_headers_and_signatures(self):
    memo = 'A' * (4096 - 1684)
    self.assertEqual(server._tcap_credit_v1_wire_size(memo), 4096)
    server._assert_tcap_credit_transport_capacity(memo)
    with self.assertRaisesRegex(ValueError, 'v1 transaction is 4097 bytes'):
        server._assert_tcap_credit_transport_capacity(memo + 'A')
