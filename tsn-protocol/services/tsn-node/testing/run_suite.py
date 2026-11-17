"""Run every existing Node check offline: python -m testing.run_suite."""
import argparse
import contextlib
from functools import partial, update_wrapper
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

import httpx
from .allow_serializer_subprocess import allow_serializer_subprocess
from .check_plain_snapshot import check_plain_snapshot
from .deny_async_http import deny_async_http
from .deny_sync_http import deny_sync_http
from .source_hashes import source_hashes

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--report-dir", type=Path)
parser.add_argument("--native-library", type=Path)
options = parser.parse_args()
root = Path(__file__).resolve().parents[1]
output = options.report_dir or Path(tempfile.mkdtemp(prefix="tsn-node-verification-"))
output.mkdir(parents=True, exist_ok=True)
sys.path[:0] = [str(root), str(root / "tests")]
if options.native_library:
    os.environ["GPRU_NATIVE_LIBRARY_PATH"] = str(options.native_library.resolve())
# This runner deliberately uses synthetic tests. Opt-in real proving has its own
# matching artifact requirements and runs separately through unittest discovery.
for name in list(os.environ):
    if name.startswith("GPRU_TEST_") or name in {"TSN_GPRU_FUNDED_PROOF_FIXTURE", "TSN_GPRU_EPOCH_PROOF_FIXTURE"}:
        del os.environ[name]
sys.addaudithook(allow_serializer_subprocess)
before = source_hashes(root)
started = time.monotonic()
with (output / "suite.log").open("w", encoding="utf-8") as log, contextlib.redirect_stdout(log), contextlib.redirect_stderr(log), \
        patch.object(httpx.HTTPTransport, "handle_request", deny_sync_http), \
        patch.object(httpx.AsyncHTTPTransport, "handle_async_request", deny_async_http):
    # Operator diagnostics adjust sys.path; bind the local Node first.
    import server
    import app.store
    suite = unittest.defaultTestLoader.discover(str(root / "tests"), pattern="test_*.py")
    spec = importlib.util.spec_from_file_location("existing_plain_snapshot_checks", root / "tests/test_tcap_snapshot_and_credit_handoff.py")
    plain = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(plain)
    snapshot_check = update_wrapper(partial(check_plain_snapshot, plain.test_snapshot_store_round_trip_is_opaque), plain.test_snapshot_store_round_trip_is_opaque)
    suite.addTest(unittest.FunctionTestCase(snapshot_check, description="Opaque snapshot storage"))
    suite.addTest(unittest.FunctionTestCase(plain.test_credit_handoff_contains_exact_credit_fields, description="Exact credit handoff fields"))
    result = unittest.TextTestRunner(stream=log, verbosity=2).run(suite)
summary = {
    "testsRun": result.testsRun,
    "passed": result.testsRun - len(result.failures) - len(result.errors) - len(result.skipped),
    "failures": len(result.failures), "errors": len(result.errors),
    "skipped": [{"id": test.id(), "reason": reason} for test, reason in result.skipped],
    "failedTests": [test.id() for test, _ in result.failures],
    "errorTests": [test.id() for test, _ in result.errors],
    "sourceUnchanged": before == source_hashes(root),
    "elapsedSeconds": round(time.monotonic() - started, 3),
    "scope": "Synthetic/local component, ASGI and unsigned cross-language serialization checks; real HTTP blocked",
    "limits": "Four opt-in circuit/Groth16 checks require isolated matching artifacts; no live service or chain verification",
}
(output / "suite-summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
print(json.dumps(summary, indent=2))
print("Report directory: " + str(output))
raise SystemExit(0 if result.wasSuccessful() and summary["sourceUnchanged"] else 1)
