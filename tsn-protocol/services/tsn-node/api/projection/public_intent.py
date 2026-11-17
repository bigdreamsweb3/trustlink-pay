"""public_intent: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
from core.schemas.mempool_intent import MempoolIntent
from core.schemas.public_mempool_intent import PublicMempoolIntent
from typing import Any, Callable, Protocol



def public_intent(intent: MempoolIntent | dict[str, Any]) -> PublicMempoolIntent:
    data = intent.model_dump() if isinstance(intent, MempoolIntent) else intent
    return PublicMempoolIntent(**data)
