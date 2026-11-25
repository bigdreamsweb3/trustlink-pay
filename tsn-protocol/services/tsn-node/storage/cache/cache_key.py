"""Derive a cache-only AEAD key from the existing Node seed with explicit domain and Receiver binding."""
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


from .dependencies import CacheDependencies

def cache_key(node: CacheDependencies) -> bytes:
    seed = bytes(node._node_verification_signing_key())
    if len(seed) != 32:
        raise ValueError("NODE_CACHE_KEY_INVALID")
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None,
                info=b"TSN_LOCAL_NODE_REPLY_CACHE_V1\0" + node.TSN_RECEIVER_URL.encode("utf8")).derive(seed)
