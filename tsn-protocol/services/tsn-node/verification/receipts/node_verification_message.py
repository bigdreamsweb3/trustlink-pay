"""_node_verification_message: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
from typing import Any, Callable, Protocol



def _node_verification_message(attestation: dict[str, Any]) -> bytes:
    fields = (
        "version", "workId", "workKind", "decision", "inputPayloadCommitment",
        "evidenceCommitment", "executionPayloadCommitment", "verificationType", "leaseId", "leaseVersion",
        "nodeId", "keyId", "signedAt",
    )
    values = [str(attestation.get(field) or "") for field in fields]
    if any("\n" in value or "\r" in value for value in values):
        raise ValueError("Node verification attestation contains an invalid field")
    return ("TSN_NODE_VERIFICATION_V1\n" + "\n".join(values)).encode("utf-8")
