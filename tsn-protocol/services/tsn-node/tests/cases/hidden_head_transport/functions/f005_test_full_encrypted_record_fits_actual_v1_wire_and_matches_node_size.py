from server import runtime as server

def test_full_encrypted_record_fits_actual_v1_wire_and_matches_node_size(self):
    self.assertEqual(self.transport['transactionSizeLimit'], 4096)
    self.assertEqual(self.transport['instructionBytes'], 905)
    self.assertEqual(self.transport['signerCount'], 2)
    self.assertEqual(self.transport['accountCount'], 18)
    self.assertGreater(self.transport['wireBytes'], 1232)
    self.assertLessEqual(self.transport['wireBytes'], 4096)
    self.assertEqual(self.transport['wireBytes'], server._tcap_credit_v1_wire_size(self.transition['memoPayload']))
    server._assert_tcap_credit_transport_capacity(self.transition['memoPayload'])
    print(f"Offline DBrix V1 settlement: {self.transport['wireBytes']}/4096 bytes, authorization={self.transport['instructionBytes']}, Memo={self.transport['memoBytes']}")
