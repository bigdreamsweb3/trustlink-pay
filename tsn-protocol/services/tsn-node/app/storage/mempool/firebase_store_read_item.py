from __future__ import annotations


def _read_item(self, key: str, field: str):
    """Keep item-reference construction and its read in the worker thread."""
    return self._item_doc(key, field).get()
