"""Inspect or requeue one funded settlement after snapshot or TCAP preflight repair.

--execute wakes Node and can lead to Cranker submitting settlement. It never
resends the deposit. Without --execute all requests are read-only.
"""
import argparse
import os
from pathlib import Path

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work-id", required=True)
    parser.add_argument("--expected-version", type=int, required=True)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    config = {}
    node = ROOT / "tsn-protocol/services/tsn-node"
    for path in (node / ".env", node / ".env.local"):
        config.update({key: value for key, value in dotenv_values(path).items() if value is not None})
    config.update(os.environ)
    url = str(config.get("TSN_RECEIVER_URL") or "").strip().strip("\"'").rstrip("/")
    key = str(config.get("TSN_RECEIVER_NODE_API_KEY") or "").strip().strip("\"'")
    if not url or not key:
        raise ValueError("Node Receiver URL/credential is not configured")
    with httpx.Client(timeout=30, headers={"x-api-key": key}) as client:
        response = client.get(f"{url}/api/internal/node/work", params={"id": args.work_id})
        if response.status_code != 200:
            raise ValueError(f"Receiver work lookup returned HTTP {response.status_code}")
        work = response.json()["work"]
        if work["stateVersion"] != args.expected_version or work["kind"] != "SETTLEMENT" or work["status"] != "REJECTED":
            raise ValueError("Settlement is not REJECTED at the expected version")
        reason = str((work.get("verification") or {}).get("reason") or "")
        if not (reason.startswith("GPRU_HIDDEN_HEAD_WITNESS_UNAVAILABLE:")
                or reason == "TCAP settlement asset is unavailable or its reserve binding is invalid"):
            raise ValueError("Settlement rejection is outside the repaired-verification retry scope")
        funding_id = str((work.get("payload") or {}).get("intentId") or "")
        if not funding_id:
            raise ValueError("Settlement has no funding reference")
        response = client.get(f"{url}/api/internal/node/work", params={"id": funding_id})
        if response.status_code != 200:
            raise ValueError(f"Receiver funding lookup returned HTTP {response.status_code}")
        funding = response.json()["work"]
        if funding.get("kind") != "AUTHORIZED_FUNDING" or funding.get("status") != "CONFIRMED" or not (funding.get("result") or {}).get("signature"):
            raise ValueError("Settlement funding has no confirmed receipt")
        print(f"Settlement: id={work['id']} status={work['status']} stateVersion={work['stateVersion']}")
        print(f"Funding: id={funding['id']} status={funding['status']} stateVersion={funding['stateVersion']}")
        if not args.execute:
            print("Read-only inspection complete; --execute requeues only this settlement")
            return
        response = client.post(f"{url}/api/internal/node/work/retry", json={"id": args.work_id, "expectedVersion": args.expected_version})
        if response.status_code != 200:
            raise ValueError(f"Receiver retry returned HTTP {response.status_code}; inspect status before retrying")
        result = response.json()
        print(f"Settlement requeued: id={result['id']} status={result['status']} stateVersion={result['stateVersion']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Settlement retry failed: {exc}" if isinstance(exc, ValueError) else f"Settlement retry failed: {type(exc).__name__}")
        raise SystemExit(1)
