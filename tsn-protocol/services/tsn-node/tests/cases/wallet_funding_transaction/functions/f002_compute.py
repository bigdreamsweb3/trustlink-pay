from cases.wallet_funding_transaction.data import COMPUTE_PROGRAM

def compute(tag, value):
    return (COMPUTE_PROGRAM, [], bytes([tag]) + value.to_bytes(8 if tag == 3 else 4, 'little'))
