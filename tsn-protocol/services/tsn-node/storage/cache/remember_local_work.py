"""Retain bounded coordination metadata only; every execution still requires a current Receiver lease."""
import json
from pathlib import Path
from .atomic_cache_json import atomic_cache_json


from .dependencies import CacheDependencies

def remember_local_work(node: CacheDependencies, work: dict) -> None:
    directory = Path(node.LOCAL_NODE_CACHE_DIR)
    path = directory / "work-index.json"
    previous = json.loads(path.read_text(encoding="utf8")) if path.exists() else {}
    records = previous.get("records", {})
    records.pop(str(work["id"]), None)
    records[str(work["id"])] = {key: work.get(key) for key in ("id", "kind", "status", "stateVersion", "payloadCommitment")}
    while len(records) > 128:
        records.pop(next(iter(records)))
    atomic_cache_json(path, {"version": 1, "records": records})
