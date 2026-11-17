import hashlib
from server import runtime as server

def field(label):
    value = int.from_bytes(hashlib.sha256(label.encode()).digest(), 'big') % server.BN254_SCALAR_MODULUS
    return value.to_bytes(32, 'big').hex()
