"""Persist the exact reply before any outbound publication, without plaintext credentials or signing messages."""
import base64
import json
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from .cache_key import cache_key
from .cache_path import cache_path
from .atomic_cache_json import atomic_cache_json


from .dependencies import CacheDependencies

def save_local_reply(node: CacheDependencies, job: dict, reply: dict) -> None:
    encoded = json.dumps(reply, ensure_ascii=False, separators=(",", ":")).encode("utf8")
    if len(encoded) > 524288:
        raise ValueError("NODE_RELAY_REPLY_TOO_LARGE")
    nonce = os.urandom(12)
    ciphertext = AESGCM(cache_key(node)).encrypt(nonce, encoded, (job["id"] + "|" + job["requestHash"]).encode("ascii"))
    atomic_cache_json(cache_path(node, job["id"]), {"version": 1, "requestHash": job["requestHash"],
        "nonce": base64.b64encode(nonce).decode("ascii"), "ciphertext": base64.b64encode(ciphertext).decode("ascii")})
