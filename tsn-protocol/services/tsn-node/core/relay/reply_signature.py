"""Sign a response commitment for the current relay claim, distinct from a Mother transaction signature."""
import base64
import hashlib
import re


from .dependencies import RelayDependencies

def reply_signature(node: RelayDependencies, job: dict, reply: dict) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", node.TSN_NODE_ID):
        raise ValueError("NODE_RELAY_OWNER_INVALID")
    digest = hashlib.sha256(reply["body"].encode("utf8")).hexdigest()
    type_digest = hashlib.sha256(reply["contentType"].encode("utf8")).hexdigest()
    message = f"TSN_NODE_RELAY_REPLY_V1|{job['id']}|{job['requestHash']}|{job['version']}|{node.TSN_NODE_ID}|{reply['status']}|{digest}|{type_digest}"
    return base64.b64encode(node._node_verification_signing_key().sign(message.encode("ascii")).signature).decode("ascii")
