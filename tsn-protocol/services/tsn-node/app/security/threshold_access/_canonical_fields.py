from __future__ import annotations



def _canonical_fields(fields: list[str]) -> bytes:
    return "|".join(f"{len(field)}:{field}" for field in fields).encode("utf-8")
