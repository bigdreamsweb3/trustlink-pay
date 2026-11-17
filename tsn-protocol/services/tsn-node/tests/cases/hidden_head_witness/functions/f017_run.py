from pathlib import Path
import copy
from hidden_head_witness import hex_field
import os

# Public verifier/proof bytes only; never export witness openings.
async def run(fixture_verifier, points, prepared, prove_hidden_head_credit, self, /):
    proof = await prove_hidden_head_credit(prepared['witness'], fixture_verifier, 255)
    checked = await prove_hidden_head_credit(prepared['witness'], fixture_verifier, 255, existing_proof=proof)
    self.assertEqual(proof, checked)
    fixture_path = os.environ.get('TSN_GPRU_FUNDED_PROOF_FIXTURE')
    if fixture_path:
        encoded = points + b''.join((bytes.fromhex(value) for value in proof['publicInputs']))
        encoded += b''.join((bytes.fromhex(proof[name]) for name in ('proofA', 'proofB', 'proofC')))
        self.assertEqual(len(encoded), 2016)
        Path(fixture_path).write_bytes(encoded)
    tampered = copy.deepcopy(proof)
    tampered['publicInputs'][0] = hex_field(99)
    with self.assertRaisesRegex(ValueError, 'generation or verification failed'):
        await prove_hidden_head_credit(prepared['witness'], fixture_verifier, 255, existing_proof=tampered)
