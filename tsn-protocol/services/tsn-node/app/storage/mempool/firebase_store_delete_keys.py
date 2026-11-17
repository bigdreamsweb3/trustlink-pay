from __future__ import annotations



def _delete_keys(self, keys: tuple[str, ...]) -> None:
    for key in keys:
        bucket = self._doc(key)
        for doc in bucket.collection("items").stream():
            doc.reference.delete()
        bucket.delete()
