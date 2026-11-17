from pathlib import Path
import copy
from hidden_head_witness import hex_field
import os

async def run(points, prove_epoch, rpc, self, witness, /):
    proof = await prove_epoch(witness, rpc)
    self.assertEqual(proof, await prove_epoch(witness, rpc, existing_proof=proof))
    if os.environ.get('TSN_GPRU_EPOCH_PROOF_FIXTURE'):
        encoded = points + b''.join((bytes.fromhex(v) for v in proof['publicInputs'])) + b''.join((bytes.fromhex(proof[k]) for k in ('proofA', 'proofB', 'proofC')))
        self.assertEqual(len(encoded), 1248)
        Path(os.environ['TSN_GPRU_EPOCH_PROOF_FIXTURE']).write_bytes(encoded)
    for index in range(5):
        changed = copy.deepcopy(proof)
        changed['publicInputs'][index] = hex_field(int(changed['publicInputs'][index], 16) + 1)
        with self.assertRaisesRegex(ValueError, 'LOCAL_PROOF_FAILED'):
            await prove_epoch(witness, rpc, existing_proof=changed)
    changed = copy.deepcopy(witness)
    changed['amounts'][0] += 1
    with self.assertRaisesRegex(ValueError, 'LOCAL_PROOF_FAILED'):
        await prove_epoch(changed, rpc)
