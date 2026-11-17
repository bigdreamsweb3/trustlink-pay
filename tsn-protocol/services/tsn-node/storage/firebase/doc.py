from __future__ import annotations

def _doc(self, key: str):
    return self.root.document(key.replace("/", "__"))
