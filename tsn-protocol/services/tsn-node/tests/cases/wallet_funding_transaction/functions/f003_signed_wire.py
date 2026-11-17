from app.solana_pubkey import Pubkey
from app.solana_pubkey import _encode_base58
import base64
from cases.wallet_funding_transaction.functions.f001_compact import compact
from server import runtime as server

def signed_wire(instructions, signing_key):
    wallet = str(Pubkey(bytes(signing_key.verify_key)))
    writable = [wallet]
    for program, accounts, data in instructions:
        if program == server.TCAP_PROGRAM_ID and len(accounts) == 9:
            writable.extend((account for account in (accounts[3], accounts[4], accounts[5], accounts[8]) if account not in writable))
    keys = writable.copy()
    for program, accounts, data in instructions:
        for key in [*accounts, program]:
            if key not in keys:
                keys.append(key)
    message = bytes([1, 0, len(keys) - len(writable)]) + compact(len(keys))
    message += b''.join((bytes(Pubkey.from_string(key)) for key in keys)) + bytes([99]) * 32
    message += compact(len(instructions))
    for program, accounts, data in instructions:
        indexes = bytes((keys.index(account) for account in accounts))
        message += bytes([keys.index(program)]) + compact(len(indexes)) + indexes + compact(len(data)) + data
    signature = signing_key.sign(message).signature
    return (base64.b64encode(compact(1) + signature + message).decode(), _encode_base58(signature))
