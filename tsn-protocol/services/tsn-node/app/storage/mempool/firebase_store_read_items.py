from __future__ import annotations

from typing import Any

def _read_items(self, key: str) -> dict[str, Any]:
    return {
        doc.id: (doc.to_dict() or {}).get("value")
        for doc in self._doc(key).collection("items").stream()
    }
