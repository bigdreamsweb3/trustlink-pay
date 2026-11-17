from __future__ import annotations


def _write_document(self, key: str, value: str) -> None:
    """Keep reference construction and its write in the worker thread."""
    self._doc(key).set({"value": value})
