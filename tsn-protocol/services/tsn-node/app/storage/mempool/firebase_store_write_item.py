from __future__ import annotations


def _write_item(self, key: str, field: str, value: str) -> None:
    """Keep item-reference construction and its write in the worker thread."""
    self._item_doc(key, field).set({"value": value})
