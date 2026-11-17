"""delete_delete_keys: isolated helper; captured dependencies are explicit arguments."""
from __future__ import annotations
import asyncio

def delete_delete_keys(keys, self) -> None:
    for key in keys:
        bucket = self._doc(key)
        for doc in bucket.collection('items').stream():
            doc.reference.delete()
        bucket.delete()
