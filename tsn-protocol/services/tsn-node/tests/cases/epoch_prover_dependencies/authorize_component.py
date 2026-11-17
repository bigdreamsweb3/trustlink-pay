"""Verify stored-proof revalidation, transition totals and current-lease gates."""
from datetime import datetime
import os
import tempfile
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from fastapi import HTTPException
from verification.accounting import _authorize_private_coordination


async def test_authorization_uses_injected_prover_and_current_lease(self):
    proof = {"publicInputs": ["synthetic-proof"]}
    value = {"assetEntry": "asset", "reserveState": "reserve", "accountingEpoch": "epoch", "total": "42", "proof": proof}
    epoch = {"address": "epoch"}
    witness = {"total": 42}
    lease = {"leaseId": "lease", "version": 7, "expiresAt": "2099-01-01T00:00:00+00:00"}
    work = {"id": "work", "kind": "TCAP_EPOCH_ACCOUNTING", "stateVersion": 7, "crankerLease": lease}
    current = {**work}
    rpc = AsyncMock()
    with tempfile.TemporaryDirectory(prefix="tsn-epoch-port-") as directory, patch.dict(os.environ, {"GPRU_HIDDEN_HEAD_WITNESS_DIR": directory}):
        node = SimpleNamespace(
            TSN_PROGRAM_ID="synthetic-program", _parse_solana_v1_message=Mock(),
            _receiver_verified_payload=Mock(return_value={"tcapEpochAccounting": value}),
            _public_coordination=Mock(return_value=value), _assert_stored_settlement_attestation=Mock(),
            _receiver_work_by_id=AsyncMock(return_value=current), _assert_current_settlement_lease=Mock(),
            clean_env=Mock(return_value=directory), solana_rpc=rpc,
            read_epoch=AsyncMock(return_value=epoch), epoch_credits=AsyncMock(return_value=[]),
            build_epoch_witness=Mock(return_value=witness), prove_epoch=AsyncMock(return_value=proof),
        )
        authorization = await _authorize_private_coordination(node, work, "operator")
        node.prove_epoch.assert_awaited_once_with(witness, rpc, existing_proof=proof)
        node._assert_current_settlement_lease.assert_called_once_with(current, "operator")
        self.assertEqual(authorization["transition"], value)
        self.assertEqual(authorization["leaseId"], lease["leaseId"])
        self.assertEqual(authorization["leaseVersion"], lease["version"])
        self.assertEqual(authorization["expiresAtTs"], int(datetime.fromisoformat(lease["expiresAt"]).timestamp()))

        node._receiver_work_by_id.reset_mock()
        node.prove_epoch.return_value = {"publicInputs": ["changed-proof"]}
        with self.assertRaises(HTTPException) as mismatch:
            await _authorize_private_coordination(node, work, "operator")
        self.assertEqual((mismatch.exception.status_code, mismatch.exception.detail), (403, "TCAP_EPOCH_PROOF_MISMATCH"))
        node._receiver_work_by_id.assert_not_awaited()

        node.prove_epoch.return_value = proof
        node.prove_epoch.reset_mock()
        node.build_epoch_witness.return_value = {"total": 43}
        with self.assertRaises(HTTPException) as total:
            await _authorize_private_coordination(node, work, "operator")
        self.assertEqual((total.exception.status_code, total.exception.detail), (403, "TCAP_EPOCH_TOTAL_MISMATCH"))
        node.prove_epoch.assert_not_awaited()

        node.build_epoch_witness.return_value = witness
        current["stateVersion"] = 8
        with self.assertRaises(HTTPException) as changed_lease:
            await _authorize_private_coordination(node, work, "operator")
        self.assertEqual((changed_lease.exception.status_code, changed_lease.exception.detail), (409, "PRIVATE_COORDINATION_LEASE_CHANGED"))
        current["stateVersion"] = 7
        node._assert_current_settlement_lease.side_effect = HTTPException(409, "synthetic-expired-lease")
        with self.assertRaises(HTTPException) as expired:
            await _authorize_private_coordination(node, work, "operator")
        self.assertEqual(expired.exception.detail, "synthetic-expired-lease")
