"""Admit only the existing unsigned TypeScript serialization fixture."""
from pathlib import Path
import shutil
import subprocess

def allow_serializer_subprocess(event, args):
    if event != "subprocess.Popen":
        return
    protocol = Path(__file__).resolve().parents[3]
    fixtures = ("tests/settlement-v1-fixture.ts", "tests/tin-debit-v1-fixture.ts")
    expected = [[shutil.which("node") or "node", "--import", "tsx", fixture] for fixture in fixtures]
    command = args[1]
    matches = list(command) in expected if isinstance(command, (list, tuple)) else str(command) in [subprocess.list2cmdline(value) for value in expected]
    if not matches or Path(args[2]).resolve() != protocol / "services/tsn-cranker-op-daemon":
        raise RuntimeError("OFFLINE_NODE_UNEXPECTED_SUBPROCESS_BLOCKED")
