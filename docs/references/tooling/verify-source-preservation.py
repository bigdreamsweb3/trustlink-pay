"""Compare the local documentation-task baseline; never edits source files."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[3]
baseline = ROOT / "protocol-test-runs/docs-reconstruction-20261102/source-hashes.json"
if not baseline.exists():
    raise SystemExit("The original local task baseline is unavailable; cannot recreate it from current source.")
hashes = json.loads(baseline.read_text(encoding="utf-8"))
changed = [path for path, digest in hashes.items()
           if not (ROOT / path).exists() or hashlib.sha256((ROOT / path).read_bytes()).hexdigest() != digest]
report = {"sourceFilesCompared": len(hashes), "changedSourcePaths": changed,
          "scope": "Compared inspected program, SDK, Receiver, Node and Cranker sources against the initial documentation-task snapshot; generated build outputs excluded. Does not attribute independently made user changes."}
(ROOT / "docs/references/source-preservation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report))
if changed:
    raise SystemExit(1)
