"""Verify an expired settlement against unchanged finalized TCAP state.

Without --execute, Receiver only checks the evidence. --execute records
nonexecution and wakes dependent work, which can lead to ordinary settlement
submission by the running Node and Cranker. It never resends reserve funding.
"""
import argparse
import os
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from dotenv import dotenv_values


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work-id", required=True)
    parser.add_argument("--expected-version", required=True, type=int)
    parser.add_argument("--signature", required=True)
    parser.add_argument("--receiver-url", help="Pin the Receiver that owns this work")
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    node = Path(__file__).resolve().parents[1] / "tsn-protocol/services/tsn-node"
    config = {}
    for name in (".env", ".env.local"):
        config.update({k: v for k, v in dotenv_values(node / name).items() if v is not None})
    config.update(os.environ)
    url = str(args.receiver_url or config.get("TSN_RECEIVER_URL") or "").strip().strip("\"'").rstrip("/")
    key = str(config.get("TSN_RECEIVER_NODE_API_KEY") or "").strip().strip("\"'")
    parsed = urlsplit(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("A Receiver HTTP URL without credentials or query parameters is required")
    if not key:
        raise ValueError("Node Receiver credential is not configured")
    if args.expected_version < 1:
        raise ValueError("Expected version must be positive")
    response = httpx.post(f"{url}/api/internal/node/work/resolve-failed", headers={"x-api-key": key},
        json={"id": args.work_id, "expectedVersion": args.expected_version,
              "signature": args.signature, "execute": args.execute}, timeout=60)
    if response.status_code != 200:
        try:
            code = response.json().get("error", "RECEIVER_ERROR")
        except ValueError:
            code = "RECEIVER_ERROR"
        if not isinstance(code, str) or not code.replace("_", "").isalnum():
            code = "RECEIVER_ERROR"
        raise ValueError(f"Failed-settlement resolution returned HTTP {response.status_code}: {code}")
    result = response.json()
    print(f"Settlement: id={result['id']} status={result['status']} stateVersion={result['stateVersion']}")
    evidence = result["resolution"]
    print(f"Nonexecution evidence: {evidence['kind']} finalizedSlot={evidence['finalizedSlot']} rootSequence={evidence['rootSequence']}")
    print("Nonexecution recorded; dependent work awakened; original deposit and failed attempt preserved"
          if result["executed"] else "Read-only verification complete; --execute records nonexecution and wakes dependent work")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc) if isinstance(exc, ValueError) else f"Failed-settlement resolution failed: {type(exc).__name__}")
        raise SystemExit(1)
