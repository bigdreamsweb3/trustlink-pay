from __future__ import annotations



def _write_mapping(self, key: str, mapping: dict) -> None:
    batch = self.db.batch()
    for item_field, item_value in mapping.items():
        batch.set(self._item_doc(key, item_field), {"value": item_value})
    batch.commit()
