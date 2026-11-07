"""Check an expired unexecuted pool attempt; --execute requeues only that capture."""
import argparse
import os
from pathlib import Path
import httpx
from dotenv import dotenv_values


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work-id", required=True)
    parser.add_argument("--expected-version", required=True, type=int)
    parser.add_argument("--signature", required=True)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    node = Path(__file__).resolve().parents[1] / "tsn-protocol/services/tsn-node"
    config = {}
    for name in (".env", ".env.local"):
        config.update({k: v for k, v in dotenv_values(node / name).items() if v is not None})
    config.update(os.environ)
    url = str(config.get("TSN_RECEIVER_URL") or "").strip().strip("\"'").rstrip("/")
    key = str(config.get("TSN_RECEIVER_NODE_API_KEY") or "").strip().strip("\"'")
    if not url or not key:
        raise ValueError("Node Receiver URL/credential is not configured")
    response = httpx.post(f"{url}/api/internal/node/work/recover-pool", headers={"x-api-key": key},
        json={"id": args.work_id, "expectedVersion": args.expected_version, "signature": args.signature, "execute": args.execute}, timeout=60)
    if response.status_code != 200:
        code = response.json().get("error", "RECEIVER_ERROR")
        if not isinstance(code, str) or not code.replace("_", "").isalnum(): code = "RECEIVER_ERROR"
        raise ValueError(f"Pool recovery returned HTTP {response.status_code}: {code}")
    result = response.json()
    print(f"Settlement: id={result['id']} status={result['status']} stateVersion={result['stateVersion']}")
    print(f"Expired attempt: signature={result['signature']} finalizedSlot={result['finalizedSlot']} blockHeight={result['finalizedBlockHeight']}")
    print("Pool requeued for fresh Node verification; existing deposits preserved" if result['executed'] else "Read-only recovery check complete; --execute requeues the unexecuted pool and may lead to Cranker submission")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc) if isinstance(exc, ValueError) else f"Pool recovery failed: {type(exc).__name__}")
        raise SystemExit(1)
