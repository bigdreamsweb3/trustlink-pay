"""Offline checks for the guarded nonexecution operator command."""
import contextlib
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location(
    "resolve_failed_settlement", Path(__file__).resolve().parents[1] / "resolve-failed-settlement.py"
)
utility = importlib.util.module_from_spec(spec)
spec.loader.exec_module(utility)


class ResolveFailedSettlementTests(unittest.TestCase):
    def invoke(self, execute=False, response=None, extra=None):
        response = response or MagicMock(status_code=200, json=lambda: {
            "id": "failed-work", "status": "FAILED", "stateVersion": 304 if execute else 303,
            "resolution": {"kind": "EXPIRED_UNCHANGED_ROOT", "finalizedSlot": 522210480, "rootSequence": "5"},
            "executed": execute,
        })
        argv = ["resolve", "--work-id", "failed-work", "--expected-version", "303",
                "--signature", "test-signature", "--receiver-url", "http://isolated-local:8010"]
        if execute:
            argv.append("--execute")
        argv.extend(extra or [])
        output = io.StringIO()
        with patch.dict(utility.os.environ, {}, clear=True), patch("sys.argv", argv), \
                patch.object(utility, "dotenv_values", return_value={
                    "TSN_RECEIVER_URL": "http://another-receiver", "TSN_RECEIVER_NODE_API_KEY": "private-test-key",
                }), patch.object(utility.httpx, "post", return_value=response) as post, contextlib.redirect_stdout(output):
            try:
                utility.main()
            except ValueError as error:
                return post, output.getvalue(), str(error)
        return post, output.getvalue(), None

    def test_preview_pins_owning_receiver_and_does_not_execute(self):
        post, output, error = self.invoke()
        self.assertIsNone(error)
        post.assert_called_once_with(
            "http://isolated-local:8010/api/internal/node/work/resolve-failed",
            headers={"x-api-key": "private-test-key"},
            json={"id": "failed-work", "expectedVersion": 303, "signature": "test-signature", "execute": False}, timeout=60,
        )
        self.assertIn("Read-only verification", output)
        self.assertNotIn("private-test-key", output)

    def test_execute_preserves_failed_state_and_explains_wake(self):
        post, output, error = self.invoke(execute=True)
        self.assertIsNone(error)
        self.assertTrue(post.call_args.kwargs["json"]["execute"])
        self.assertIn("status=FAILED stateVersion=304", output)
        self.assertIn("dependent work awakened", output)

    def test_error_never_prints_remote_secret_or_arbitrary_body(self):
        response = MagicMock(status_code=409, json=lambda: {"error": "secret?api-key=private-test-key"})
        _, output, error = self.invoke(response=response)
        self.assertIn("HTTP 409: RECEIVER_ERROR", error)
        self.assertNotIn("private-test-key", output + error)

    def test_non_json_error_is_sanitized(self):
        response = MagicMock(status_code=404)
        response.json.side_effect = ValueError("not json")
        _, _, error = self.invoke(response=response)
        self.assertIn("HTTP 404: RECEIVER_ERROR", error)

    def test_credential_bearing_destination_is_refused(self):
        post, _, error = self.invoke(extra=["--receiver-url", "http://user:secret@isolated-local:8010"])
        self.assertIn("without credentials", error)
        post.assert_not_called()


if __name__ == "__main__":
    unittest.main()
