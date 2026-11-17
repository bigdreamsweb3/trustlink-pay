from __future__ import annotations


def _read_document(self, key: str):
    """Keep reference construction and its read in the worker thread."""
    return self._doc(key).get()
