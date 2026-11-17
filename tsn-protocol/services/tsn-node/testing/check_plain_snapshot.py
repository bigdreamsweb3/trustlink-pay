"""Run the existing opaque-snapshot check with a temporary directory."""
from pathlib import Path
import tempfile

def check_plain_snapshot(check):
    with tempfile.TemporaryDirectory(prefix="tsn-component-snapshot-") as directory:
        check(Path(directory))
