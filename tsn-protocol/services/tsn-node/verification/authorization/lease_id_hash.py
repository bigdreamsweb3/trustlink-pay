"""lease_id_hash: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
import hashlib
from typing import Any, Callable, Protocol



def lease_id_hash(work_id: str) -> bytes:
    return hashlib.sha256(work_id.encode("utf-8")).digest()
