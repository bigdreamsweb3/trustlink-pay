"""Read one bounded field and advance the caller-owned TIN cursor."""
def take_private_tin_bytes(buffer: bytes, cursor: list[int], length: int, label: str) -> bytes:
    offset = cursor[0]
    if length < 0 or offset + length > len(buffer):
        raise ValueError(f"private TIN account {label} is truncated")
    value = buffer[offset:offset + length]
    cursor[0] += length
    return value
