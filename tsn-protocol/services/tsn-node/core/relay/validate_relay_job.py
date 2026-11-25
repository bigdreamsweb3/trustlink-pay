"""Validate the fixed Receiver request envelope before dispatching to the existing in-process application."""
import hashlib
import json
import re


def validate_relay_job(job: dict) -> dict:
    if not isinstance(job, dict) or not re.fullmatch(r"[0-9a-f]{64}", str(job.get("id", ""))) or not re.fullmatch(r"[0-9a-f]{64}", str(job.get("requestHash", ""))):
        raise ValueError("NODE_RELAY_JOB_INVALID")
    request = job.get("request")
    if not isinstance(request, dict) or set(request) != {"method", "path", "search", "headers", "body"}:
        raise ValueError("NODE_RELAY_REQUEST_INVALID")
    if (request["method"] not in ("GET", "POST", "PATCH") or not isinstance(request["path"], str)
        or not re.fullmatch(r"/(?:network/[a-z0-9/-]+|tin-routes/[a-z0-9/-]+|tin-operations(?:/[a-z0-9/-]+)?|intents(?:/[A-Za-z0-9_-]+/status)?|intent-work|metrics|settlement-networks|epoch/status|threshold-access/nonces/consume|internal/settlement-authorizations/(?:settlement|signature))", request["path"])
        or ".." in request["path"] or not isinstance(request["search"], str) or len(request["search"]) > 2048
        or request["search"] and not request["search"].startswith("?") or not isinstance(request["headers"], dict)
        or any(key not in ("authorization", "content-type", "x-platform-key", "x-platform-signature") or not isinstance(value, str)
               or len(value) > 8192 or "\r" in value or "\n" in value for key, value in request["headers"].items())
        or request["body"] is not None and not isinstance(request["body"], str)
        or len((request["body"] or "").encode("utf8")) > 65536
        or request["method"] == "GET" and request["body"] is not None):
        raise ValueError("NODE_RELAY_REQUEST_INVALID")
    digest = hashlib.sha256(json.dumps(request, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf8")).hexdigest()
    if digest != job["requestHash"]:
        raise ValueError("NODE_RELAY_REQUEST_HASH_MISMATCH")
    return request
