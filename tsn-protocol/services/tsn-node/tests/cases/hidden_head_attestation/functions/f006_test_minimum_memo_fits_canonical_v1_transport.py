from server import runtime as server

def test_minimum_memo_fits_canonical_v1_transport(self):
    memo = 'TSN_GPRU_HEAD_V1:' + ':'.join(['0' * 64] * 7) + ':A'
    self.assertEqual(len(memo), 473)
    self.assertEqual(server._tcap_credit_v1_wire_size(memo), 2157)
    server._assert_tcap_credit_transport_capacity(memo)
