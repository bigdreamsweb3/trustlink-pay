from gpru_crypto import BABYJUB_FIELD
from hidden_head_witness import hex_field
from cases.funding_note.functions.f001_note import note
from funding_note import validate_funding_note

def test_opening_is_canonical_nonzero_and_bound_to_commitment(self):
    opening = note()
    self.assertEqual(validate_funding_note(opening), opening)
    self.assertEqual(validate_funding_note(note(blinding=0)), note(blinding=0))
    for changes in ({'secret': hex_field(3)}, {'blinding': hex_field(4)}, {'secret': hex_field(0)}, {'secret': BABYJUB_FIELD.to_bytes(32, 'big').hex()}, {'extra': 'private'}, {'version': True}):
        with self.subTest(changes=changes), self.assertRaises(ValueError):
            validate_funding_note({**opening, **changes})
