from unittest.mock import patch
from settlement.proving.prover_node_args import prover_node_args
from settlement.proving.resource_limits import LOCAL_PROVER_LOCK
from settlement.proving.prove_hidden_head_credit import LOCAL_PROVER_LOCK as CREDIT_LOCK
from settlement.proving.prove_epoch import LOCAL_PROVER_LOCK as EPOCH_LOCK
from settlement.debit.prove import LOCAL_PROVER_LOCK as DEBIT_LOCK


async def test_resource_arguments(self):
    with patch.dict("os.environ", {"TSN_PROVER_HEAP_MB": "1024", "GPRU_NODE_EXECUTABLE": "synthetic-node"}):
        self.assertEqual(prover_node_args(), ["synthetic-node", "--max-old-space-size=1024"])
    for value in ("0", "511", "4097", "--unsafe", "x"):
        with patch.dict("os.environ", {"TSN_PROVER_HEAP_MB": value}):
            with self.assertRaises(ValueError):
                prover_node_args()
    self.assertIs(CREDIT_LOCK, LOCAL_PROVER_LOCK)
    self.assertIs(EPOCH_LOCK, LOCAL_PROVER_LOCK)
    self.assertIs(DEBIT_LOCK, LOCAL_PROVER_LOCK)
