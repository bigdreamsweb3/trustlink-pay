from gpru_crypto import poseidon_v1

def test_poseidon_matches_circom_reference_vector(self):
    self.assertEqual(poseidon_v1([1, 2]), 7853200120776062878684798364095072458815029376092732009249414926327459813530)
