#!/usr/bin/env python3
"""Capture redacted TSN Devnet evidence without copying private payloads."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STORE = ROOT / "tsn-protocol/services/tsn-receiver/.receiver-store.json"
DEFAULT_RPC = "https://tsn-rpc-gateway.vercel.app"


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def http_json(url: str, method: str = "GET", payload: dict[str, Any] | None = None,
              timeout: float = 10.0) -> tuple[int, Any]:
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(url, data=data, method=method,
                                     headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            try:
                body = json.loads(raw)
            except (json.JSONDecodeError, UnicodeDecodeError):
                body = {"bodyPreview": raw[:300].decode("utf-8", "replace")}
            return response.status, body
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            body = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError):
            body = {"bodyPreview": raw[:300].decode("utf-8", "replace")}
        return error.code, body
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        return 0, {"error": type(error).__name__, "message": str(error)[:240]}


def health_snapshot(args: argparse.Namespace) -> dict[str, Any]:
    endpoints = {
        "tsnXp": f"{args.xp.rstrip('/')}/api/health",
        "receiver": f"{args.receiver.rstrip('/')}/api/health",
        "node": f"{args.node.rstrip('/')}/settlement-networks",
        "rpc": f"{args.rpc.rstrip('/')}/health",
    }
    result: dict[str, Any] = {"capturedAt": now(), "services": {}}
    for name, url in endpoints.items():
        status, body = http_json(url, timeout=args.timeout)
        service: dict[str, Any] = {"httpStatus": status, "reachable": status == 200}
        if isinstance(body, dict):
            if name == "node":
                service["networkCount"] = len(body.get("networks", [])) if isinstance(body.get("networks"), list) else None
                service["status"] = body.get("status") or body.get("ready")
                service["source"] = body.get("source")
            else:
                for key in ("service", "status", "ok", "mode", "latencyMs"):
                    if key in body and isinstance(body[key], (str, int, float, bool, type(None))):
                        service[key] = body[key]
            if status != 200 and body.get("error"):
                service["error"] = body["error"]
        result["services"][name] = service
    return result


def safe_lease(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    safe = {key: value[key] for key in ("leaseId", "version", "expiresAt") if key in value}
    owner = value.get("owner")
    if isinstance(owner, str) and owner:
        safe["ownerShort"] = owner[:6] + "…" + owner[-4:] if len(owner) > 14 else "configured"
    return safe or None


def safe_record(record: Any, document_id: str) -> dict[str, Any] | None:
    if not isinstance(record, dict) or record.get("kind") not in {"TIN_OPERATION", "AUTHORIZED_FUNDING", "SETTLEMENT"}:
        return None
    result: dict[str, Any] = {"id": str(record.get("id") or document_id),
                              "kind": record.get("kind"), "status": record.get("status")}
    for key in ("stateVersion", "payloadCommitment", "receivedAt", "updatedAt"):
        value = record.get(key)
        if isinstance(value, (str, int, float, bool, type(None))):
            result[key] = value
    for key in ("nodeLease", "crankerLease"):
        lease = safe_lease(record.get(key))
        if lease:
            result[key] = lease
    verification = record.get("verification")
    if isinstance(verification, dict):
        safe_verification = {key: verification[key] for key in
                             ("status", "verified", "verificationType", "verifiedAt", "reasonCode")
                             if isinstance(verification.get(key), (str, int, float, bool, type(None)))}
        if safe_verification:
            result["verification"] = safe_verification
    outcome = record.get("result")
    if isinstance(outcome, dict):
        safe_result = {key: outcome[key] for key in
                       ("status", "signature", "transactionSignature", "registryPda", "confirmedAt", "slot", "errorCode")
                       if isinstance(outcome.get(key), (str, int, float, bool, type(None)))}
        tin = outcome.get("tin")
        if isinstance(tin, (str, int)) and str(tin):
            safe_result["tinMasked"] = "…" + str(tin)[-2:]
        if safe_result:
            result["result"] = safe_result
    # Never copy record.payload, authorization, encrypted envelopes, signatures,
    # owner details, route data, or arbitrary nested fields into the bundle.
    return result


def receiver_snapshot(store_path: Path, intent_id: str | None) -> dict[str, Any]:
    if not store_path.exists():
        return {"capturedAt": now(), "source": str(store_path), "available": False,
                "note": "Local JSON store not found; hosted Receiver records are not read by this tool."}
    try:
        raw = json.loads(store_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return {"capturedAt": now(), "available": False, "error": type(error).__name__}
    collection = os.environ.get("TSN_RECEIVER_COLLECTION", "tsn_receiver_work")
    rows = raw.get(collection, {}) if isinstance(raw, dict) else {}
    if not isinstance(rows, dict):
        rows = {}
    records = [safe_record(value, str(key)) for key, value in rows.items()]
    records = [item for item in records if item is not None]
    if intent_id:
        records = [item for item in records if item.get("id") == intent_id]
    return {"capturedAt": now(), "source": "local-json", "collection": collection,
            "available": True, "count": len(records), "records": records}


def extract_log_events(path: Path, needle: str | None) -> dict[str, Any]:
    if not path.exists():
        return {"available": False, "path": str(path)}
    # Copy logs exactly as captured. The collector does not print them to stdout.
    # The manifest warns that operators must review logs before sharing.
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    if needle:
        lines = [line for line in lines if needle in line]
    else:
        keywords = ("lease", "verif", "signature", "TIN", "intent", "CONFIRMED", "submitted", "FAILED", "rejected", "commitment")
        lines = [line for line in lines if any(word.lower() in line.lower() for word in keywords)]
    lines = [redact_log(line) for line in lines]
    return {"available": True, "path": str(path), "matchedLines": len(lines), "lines": lines}


def redact_log(line: str) -> str:
    patterns = [
        (r"(?i)(x-api-key\s*[:=]\s*)[^\s,;]+", r"\1[REDACTED]"),
        (r"(?i)((?:TSN_)?[A-Z0-9_]*(?:PRIVATE_KEY|SECRET|TOKEN|API_KEY)\s*=\s*)[^\s,;]+", r"\1[REDACTED]"),
        (r'(?i)("(?:encryptedMasterSeed|encryptedPublicRouteEnvelope|privateKey|apiKey|secret|ownerSignature|authorization)"\s*:\s*")[^"]*(")', r"\1[REDACTED]\2"),
        (r"(?i)(encrypted(?:masterseed|publicrouteenvelope|payload)\s*[=:]\s*)[^\s,;]+", r"\1[REDACTED]"),
    ]
    for pattern, replacement in patterns:
        line = re.sub(pattern, replacement, line)
    return line[:2000]


def rpc_signature(args: argparse.Namespace, signature: str) -> dict[str, Any]:
    status, body = http_json(args.rpc.rstrip("/"), method="POST", timeout=args.timeout,
                             payload={"jsonrpc": "2.0", "id": 1, "method": "getSignatureStatuses",
                                      "params": [[signature], {"searchTransactionHistory": True}]})
    value = body.get("result", {}).get("value", [None])[0] if isinstance(body, dict) else None
    if not isinstance(value, dict):
        return {"capturedAt": now(), "signature": signature, "httpStatus": status,
                "found": False, "rpcError": body.get("error") if isinstance(body, dict) else None}
    return {"capturedAt": now(), "signature": signature, "found": True,
            "slot": value.get("slot"), "confirmationStatus": value.get("confirmationStatus"),
            "err": value.get("err"),
            "finalized": value.get("confirmationStatus") == "finalized" and value.get("err") is None,
            "explorer": f"https://explorer.solana.com/tx/{signature}?cluster=devnet"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, help="Evidence output folder (created if omitted).")
    parser.add_argument("--xp", default="http://127.0.0.1:4317")
    parser.add_argument("--receiver", default="http://127.0.0.1:8010")
    parser.add_argument("--node", default="http://127.0.0.1:8000")
    parser.add_argument("--rpc", default=os.environ.get("TSN_RPC_GATEWAY_URL", DEFAULT_RPC))
    parser.add_argument("--store", type=Path, default=DEFAULT_STORE)
    parser.add_argument("--intent-id", help="Filter the sanitized Receiver snapshot to one work ID.")
    parser.add_argument("--signature", help="Check a Solana signature on the configured Devnet RPC.")
    parser.add_argument("--registry", help="Optional registry PDA to capture public account metadata for.")
    parser.add_argument("--node-log", help="Optional Node log path; matching lines are filtered and secret fields redacted.")
    parser.add_argument("--cranker-log", help="Optional Cranker log path; matching lines are filtered and secret fields redacted.")
    parser.add_argument("--timeout", type=float, default=8.0)
    parser.add_argument("--watch", type=int, default=0, metavar="SECONDS",
                        help="Poll health and Receiver evidence every 3 seconds for this many seconds.")
    args = parser.parse_args()

    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    out = args.out or ROOT / "evidence" / f"tsn-run-{stamp}"
    out.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, Any] = {"capturedAt": now(), "network": "solana-devnet",
                                "intentId": args.intent_id, "signature": args.signature,
                                "privacy": "allowlisted summaries only; raw Receiver payloads are excluded",
                                "paths": {}}
    health = health_snapshot(args)
    write_json(out / "health.json", health)
    manifest["paths"]["health"] = "health.json"
    receiver = receiver_snapshot(args.store, args.intent_id)
    write_json(out / "receiver-evidence.json", receiver)
    manifest["paths"]["receiver"] = "receiver-evidence.json"

    for name, source in (("node", args.node_log), ("cranker", args.cranker_log)):
        if source:
            extracted = extract_log_events(Path(source), args.intent_id)
            if extracted.get("available"):
                write_json(out / f"{name}-events.json", extracted)
                manifest["paths"][name] = f"{name}-events.json"

    if args.signature:
        tx = rpc_signature(args, args.signature)
        write_json(out / "solana-signature.json", tx)
        manifest["paths"]["solana"] = "solana-signature.json"
    if args.registry:
        status, body = http_json(args.rpc.rstrip("/"), method="POST", timeout=args.timeout,
                                 payload={"jsonrpc": "2.0", "id": 2, "method": "getAccountInfo",
                                          "params": [args.registry, {"encoding": "base64", "commitment": "finalized"}]})
        account = body.get("result", {}) if isinstance(body, dict) else {}
        value = account.get("value") if isinstance(account, dict) else None
        registry = {"capturedAt": now(), "address": args.registry, "httpStatus": status,
                    "exists": isinstance(value, dict), "slot": account.get("context", {}).get("slot") if isinstance(account, dict) else None}
        if isinstance(value, dict):
            registry.update({key: value.get(key) for key in ("owner", "lamports", "executable")})
            data = value.get("data")
            registry["dataLength"] = len(data[0]) if isinstance(data, list) and data and isinstance(data[0], str) else None
        write_json(out / "solana-registry.json", registry)
        manifest["paths"]["registry"] = "solana-registry.json"

    if args.watch > 0:
        deadline = time.monotonic() + args.watch
        samples = []
        while time.monotonic() < deadline:
            samples.append({"health": health_snapshot(args),
                            "receiver": receiver_snapshot(args.store, args.intent_id)})
            time.sleep(min(3, max(0, deadline - time.monotonic())))
        write_json(out / "timeline.json", samples)
        manifest["paths"]["timeline"] = "timeline.json"

    write_json(out / "manifest.json", manifest)
    print(f"Evidence folder: {out}")
    print(f"Health: {sum(1 for s in health['services'].values() if s['reachable'])}/{len(health['services'])} endpoints responding")
    print(f"Receiver records captured: {receiver.get('count', 0)} (sanitized)")
    print("Log excerpts are filtered and redacted; review the bundle before sharing it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
