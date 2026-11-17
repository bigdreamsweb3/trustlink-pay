from __future__ import annotations

def _item_doc(self, key: str, field: str):
    return self._doc(key).collection("items").document(field.replace("/", "__"))
