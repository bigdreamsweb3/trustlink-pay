"""Verify exact aggregate witness/prover handoff and incomplete-group rejection."""
from pathlib import Path
import os
import tempfile
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from private_credit_coordination import PrivateCreditWait
from verification.accounting import _verify_private_coordination_work


async def test_verification_uses_injected_epoch_prover(self):
    epoch = {"address": "accounting-epoch", "count": 2}
    credits = ["first-credit", "second-credit"]
    witness = {"total": 42, "count": 2}
    proof = {"publicInputs": ["synthetic-proof"]}
    rpc = AsyncMock()
    payload = {"assetEntry": "asset", "reserveState": "reserve", "accountingEpoch": epoch["address"]}
    work = {"payload": payload}
    with tempfile.TemporaryDirectory(prefix="tsn-epoch-port-") as directory, patch.dict(os.environ, {"GPRU_HIDDEN_HEAD_WITNESS_DIR": directory}):
        node = SimpleNamespace(
            TSN_PROGRAM_ID="synthetic-program", _parse_solana_v1_message=Mock(),
            clean_env=Mock(return_value=directory), solana_rpc=rpc,
            read_epoch=AsyncMock(return_value=epoch), epoch_credits=AsyncMock(return_value=credits),
            build_epoch_witness=Mock(return_value=witness), prove_epoch=AsyncMock(return_value=proof),
        )
        result = await _verify_private_coordination_work(node, work)
        node.epoch_credits.assert_awaited_once_with(rpc, epoch, node._parse_solana_v1_message, node.TSN_PROGRAM_ID)
        node.build_epoch_witness.assert_called_once_with(epoch, credits, Path(directory))
        node.prove_epoch.assert_awaited_once_with(witness, rpc)
        self.assertEqual(result["verificationType"], "TSN_TCAP_EPOCH_ACCOUNTING_V1")
        self.assertEqual(result["verifiedPayload"]["tcapEpochAccounting"], {**payload, "total": "42", "proof": proof})
        epoch["count"] = 1
        node.prove_epoch.reset_mock()
        with self.assertRaisesRegex(PrivateCreditWait, "TCAP_EPOCH_REQUIRES_COMPLETE_GROUP"):
            await _verify_private_coordination_work(node, work)
        node.prove_epoch.assert_not_awaited()
