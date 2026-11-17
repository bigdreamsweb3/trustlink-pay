from __future__ import annotations

def canonical(fields: list[str]) -> bytes:
    return '|'.join((f'{len(field)}:{field}' for field in fields)).encode()
