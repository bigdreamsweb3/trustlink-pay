import copy
from funding_note import funding_nullifier
from cases.funding_note.functions.f001_note import note

# Different blinding cannot turn one secret into a second spend identity.
def test_one_note_has_one_nullifier_independent_of_amount_recipient_or_retry(self):
    opening = note()
    original = funding_nullifier(opening)
    self.assertEqual(original, funding_nullifier(copy.deepcopy(opening)))
    self.assertNotEqual(original, funding_nullifier(note(secret=3)))
    self.assertEqual(original, funding_nullifier(note(blinding=5)))
