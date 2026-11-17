from gpru_crypto import BABYJUB_FIELD
from credit_amount import commitment

def test_amount_commitment_binds_every_opening_and_repeated_amount_is_blinded(self):
    original = commitment(7, 500000, 11, 13)
    for args in [(7, 500000, 12, 13), (8, 500000, 11, 13), (7, 500001, 11, 13), (7, 500000, 11, 14)]:
        self.assertNotEqual(original, commitment(*args))
    for args in [(7, 0, 11, 13), (7, 1, 0, 13), (7, 1, BABYJUB_FIELD, 13), (7, 2 ** 64, 11, 13)]:
        with self.assertRaises(ValueError):
            commitment(*args)
