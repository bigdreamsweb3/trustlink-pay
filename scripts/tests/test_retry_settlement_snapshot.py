"""Offline operator recovery checks; no live Receiver or transaction submission."""
import contextlib
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location(
    "retry_settlement_snapshot", Path(__file__).resolve().parents[1] / "retry-settlement-snapshot.py"
)
retry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(retry)


class SettlementRetryUtilityTests(unittest.TestCase):
    def invoke(self, reason, execute=False):
        settlement = {
            "id": "test-settlement", "kind": "SETTLEMENT", "status": "REJECTED", "stateVersion": 3,
            "verification": {"reason": reason}, "payload": {"intentId": "test-funding"},
        }
        funding = {
            "id": "test-funding", "kind": "AUTHORIZED_FUNDING", "status": "CONFIRMED", "stateVersion": 5,
            "result": {"signature": "test-confirmed-signature"},
        }
        client = MagicMock()
        client.get.side_effect = [
            MagicMock(status_code=200, json=lambda: {"work": settlement}),
            MagicMock(status_code=200, json=lambda: {"work": funding}),
        ]
        client.post.return_value = MagicMock(
            status_code=200, json=lambda: {"id": settlement["id"], "status": "RECEIVED", "stateVersion": 4}
        )
        output = io.StringIO()
        argv = ["retry", "--work-id", settlement["id"], "--expected-version", "3"]
        if execute:
            argv.append("--execute")
        with patch.dict(retry.os.environ, {}, clear=True), patch("sys.argv", argv), \
                patch.object(retry, "dotenv_values", return_value={
                    "TSN_RECEIVER_URL": "http://isolated-receiver", "TSN_RECEIVER_NODE_API_KEY": "private-test-key",
                }), patch.object(retry.httpx, "Client") as factory, contextlib.redirect_stdout(output):
            factory.return_value.__enter__.return_value = client
            try:
                retry.main()
            except ValueError as exc:
                return client, output.getvalue(), str(exc)
        return client, output.getvalue(), None

    def test_repaired_memo_count_error_is_inspected_without_requeue(self):
        client, output, error = self.invoke("GPRU transaction record is missing its twelve public hidden-head inputs")
        self.assertIsNone(error)
        self.assertEqual(client.get.call_count, 2)
        client.post.assert_not_called()
        self.assertNotIn("private-test-key", output)

    def test_execute_requeues_only_the_settlement_id_and_version(self):
        client, output, error = self.invoke(
            "GPRU transaction record is missing its twelve public hidden-head inputs", execute=True
        )
        self.assertIsNone(error)
        client.post.assert_called_once_with(
            "http://isolated-receiver/api/internal/node/work/retry",
            json={"id": "test-settlement", "expectedVersion": 3},
        )
        self.assertNotIn("private-test-key", output)

    def test_unrecognized_input_error_cannot_be_retried(self):
        for reason in (
            "GPRU transaction record is missing its twelve public hidden-head inputs: unrelated",
            "GPRU transaction record requires exactly thirteen public hidden-head inputs",
            "bad proof",
        ):
            with self.subTest(reason=reason):
                client, _, error = self.invoke(reason, execute=True)
                self.assertIn("outside", error)
                client.post.assert_not_called()

    def test_funded_root_reason_matches_receiver_retry_scope(self):
        client, _, error = self.invoke("TCAP_FUNDING_ROOT_CHANGED_BEFORE_SETTLEMENT")
        self.assertIsNone(error)
        client.post.assert_not_called()


if __name__ == "__main__":
    unittest.main()
