from funding_note import NOTE_DOMAIN
from hidden_head_witness import hex_field
from gpru_crypto import poseidon_v1

def note(secret=1, blinding=2):
    return {'version': 1, 'secret': hex_field(secret), 'blinding': hex_field(blinding), 'commitment': hex_field(poseidon_v1([NOTE_DOMAIN, secret, blinding]))}
