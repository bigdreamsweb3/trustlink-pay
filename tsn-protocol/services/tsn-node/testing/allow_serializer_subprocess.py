"""Admit only the existing unsigned TypeScript serialization fixture."""
from pathlib import Path
import shutil
import subprocess

def allow_serializer_subprocess(event, args):
    if event != "subprocess.Popen":
        return
    protocol = Path(__file__).resolve().parents[3]
    expected = [shutil.which("node") or "node", "--import", "tsx", "tests/settlement-v1-fixture.ts"]
    command = args[1]
    matches = list(command) == expected if isinstance(command, (list, tuple)) else str(command) == subprocess.list2cmdline(expected)
    if not matches or Path(args[2]).resolve() != protocol / "services/tsn-cranker-op-daemon":
        raise RuntimeError("OFFLINE_NODE_UNEXPECTED_SUBPROCESS_BLOCKED")
