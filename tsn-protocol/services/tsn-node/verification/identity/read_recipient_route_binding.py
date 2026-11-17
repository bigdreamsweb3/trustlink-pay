"""read_recipient_route_binding: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime
from datetime import timezone
from typing import Any
from typing import Optional
import json
import re
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    get_mempool_store: Callable[..., Any]
    k_recipient_route_binding: Callable[..., Any]
    parse_iso: Callable[..., Any]


async def read_recipient_route_binding(node: Dependencies, work_id: str) -> Optional[dict[str, Any]]:
    store = await node.get_mempool_store()
    key = node.k_recipient_route_binding(work_id)
    raw = await store.get(key)
    if not raw:
        return None
    try:
        binding = json.loads(raw)
        expires_at = node.parse_iso(str(binding["expiresAt"]))
        if expires_at <= datetime.now(timezone.utc):
            await store.delete(key)
            return None
        if (
            not re.fullmatch(r"\d+", str(binding.get("tin") or ""))
            or not re.fullmatch(r"[a-f0-9]{64}", str(binding.get("commitment") or "").lower())
            or int(binding.get("routeVersion") or 0) < 1
        ):
            raise ValueError("invalid recipient route binding")
        return binding
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        await store.delete(key)
        return None
