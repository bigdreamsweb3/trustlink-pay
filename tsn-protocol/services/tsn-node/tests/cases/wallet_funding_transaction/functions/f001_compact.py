

def compact(value):
    encoded = bytearray()
    while value >= 128:
        encoded.append(value & 127 | 128)
        value >>= 7
    encoded.append(value)
    return bytes(encoded)
