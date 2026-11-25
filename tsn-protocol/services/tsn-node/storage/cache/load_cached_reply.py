"""Recover only the exact encrypted reply; an interrupted reservation never permits automatic re-execution."""
import base64
import json
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from .cache_key import cache_key
from .cache_path import cache_path


from .dependencies import CacheDependencies

def load_cached_reply(node: CacheDependencies, job: dict) -> dict | None:
    path = cache_path(node, job["id"])
    if not path.exists():
        return None
    if path.is_symlink() or path.stat().st_size > 1048576:
        raise ValueError("NODE_CACHE_INVALID")
    saved = json.loads(path.read_text(encoding="utf8"))
    if not isinstance(saved, dict) or saved.get("version") != 1:
        raise ValueError("NODE_CACHE_INVALID")
    if saved.get("requestHash") != job["requestHash"]:
        raise ValueError("NODE_CACHE_REQUEST_CONFLICT")
    if "ciphertext" not in saved:
        raise ValueError("NODE_RELAY_OUTCOME_UNKNOWN")
    aad = (job["id"] + "|" + job["requestHash"]).encode("ascii")
    try:
        plaintext = AESGCM(cache_key(node)).decrypt(base64.b64decode(saved["nonce"], validate=True),
                                                   base64.b64decode(saved["ciphertext"], validate=True), aad)
        reply = json.loads(plaintext)
    except Exception as exc:
        raise ValueError("NODE_CACHE_INVALID") from exc
    if not isinstance(reply, dict) or set(reply) != {"status", "body", "contentType"}:
        raise ValueError("NODE_CACHE_INVALID")
    return reply
