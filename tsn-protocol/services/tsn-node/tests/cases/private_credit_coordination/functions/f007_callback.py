from app.solana_pubkey import Pubkey
import hashlib

def callback(label):
    return str(Pubkey(hashlib.sha256(label.encode()).digest()))
