from __future__ import annotations



def _consume(self, key: str, field: str, value: str) -> bool:
    update = self.firestore.transactional(self._consume_transaction)
    return bool(update(self.db.transaction(), key, field, value))
