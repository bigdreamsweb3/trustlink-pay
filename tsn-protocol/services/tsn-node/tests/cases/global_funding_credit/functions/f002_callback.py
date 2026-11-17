from app.solana_pubkey import Pubkey

def callback(value):
    return str(Pubkey(bytes([value]) * 32))
