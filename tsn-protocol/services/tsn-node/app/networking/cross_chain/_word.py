from __future__ import annotations



def _word(data: str, index: int) -> int:
    raw = data[2:] if data.startswith("0x") else data
    start = index * 64
    return int(raw[start:start + 64], 16)
