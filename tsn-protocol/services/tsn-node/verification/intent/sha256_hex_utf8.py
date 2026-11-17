"""_sha256_hex_utf8: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
import hashlib
from typing import Any, Callable, Protocol



def _sha256_hex_utf8(*parts: Any) -> str:
    return hashlib.sha256("|".join(str(part) for part in parts).encode("utf-8")).hexdigest()
