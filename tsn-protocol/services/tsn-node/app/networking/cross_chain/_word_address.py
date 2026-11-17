from __future__ import annotations



def _word_address(data: str, index: int) -> str:
    raw = data[2:] if data.startswith("0x") else data
    return "0x" + raw[index * 64 + 24:index * 64 + 64].lower()
