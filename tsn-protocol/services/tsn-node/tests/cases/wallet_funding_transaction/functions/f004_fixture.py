from app.solana_pubkey import Pubkey
from nacl.signing import SigningKey
from funding_snapshot_sync import funding_root_address
import hashlib
from test_funding_note import note
from server import runtime as server

def fixture():
    signing_key = SigningKey(bytes([17]) * 32)
    wallet = str(Pubkey(bytes(signing_key.verify_key)))
    names = ('config', 'assetEntry', 'reserveState', 'source', 'vault', 'mint', 'tokenProgram')
    accounts = {name: str(Pubkey(bytes([index]) * 32)) for index, name in enumerate(names, 1)}
    accounts.update(depositor=wallet, fundingRootAccount=str(funding_root_address(server.TCAP_PROGRAM_ID)[0]))
    opening = note()
    data = hashlib.sha256(b'global:deposit_private_funding_v1').digest()[:8]
    data += 1000000 .to_bytes(8, 'little') + bytes.fromhex(opening['commitment'])
    order = ('depositor', *names, 'fundingRootAccount')
    deposit = (server.TCAP_PROGRAM_ID, [accounts[name] for name in order], data)
    context = {'depositAccounts': accounts, 'depositAmountBaseUnits': '1000000', 'fundingNoteCommitment': opening['commitment']}
    return (signing_key, deposit, context, opening)
