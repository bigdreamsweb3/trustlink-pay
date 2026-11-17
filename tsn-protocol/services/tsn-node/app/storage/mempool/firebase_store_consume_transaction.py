from __future__ import annotations



def _consume_transaction(self, transaction, key: str, field: str, value: str) -> bool:
    reference = self._item_doc(key, field)
    snapshot = reference.get(transaction=transaction)
    if snapshot.exists:
        return False
    transaction.set(reference, {"value": value})
    return True
