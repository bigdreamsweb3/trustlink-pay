from app.solana_pubkey import Pubkey
import base64
import hashlib
from cases.private_credit_coordination.functions.f007_callback import callback as _case_f007_callback

def signing_fixture(self):
    from server import runtime as server
    from nacl.signing import SigningKey
    from unittest.mock import Mock
    account = _case_f007_callback
    operator = account('offline-native-cranker')
    signing_key = SigningKey(bytes([47]) * 32)
    authority = str(Pubkey(bytes(signing_key.verify_key)))
    value = {'assetEntry': account('offline-asset'), 'tcapConfig': account('offline-config'), 'reserveState': account('offline-reserve'), 'accountingEpoch': account('offline-epoch'), 'total': '100', 'proof': {'publicInputs': ['01' * 32] * 5, 'proofA': '02' * 64, 'proofB': '03' * 128, 'proofC': '04' * 64}}
    work = {'id': 'fixture-epoch', 'kind': 'TCAP_EPOCH_ACCOUNTING', 'status': 'CRANKER_LEASED', 'stateVersion': 7, 'payload': {k: value[k] for k in ('assetEntry', 'reserveState', 'tcapConfig', 'accountingEpoch')}, 'crankerLease': {'owner': operator, 'leaseId': 'fixture-lease', 'version': 7, 'expiresAt': '2040-01-01T00:00:00Z'}}
    verifier = str(Pubkey.find_program_address([b'gpru:tcap-epoch-verifier:v1'], Pubkey.from_string(server.GPRU_PROGRAM_ID))[0])
    accounts = [authority, str(server.get_mother_escrow_pda()), value['tcapConfig'], value['assetEntry'], value['reserveState'], value['accountingEpoch'], verifier, server.GPRU_PROGRAM_ID]
    keys = list(dict.fromkeys([operator, authority, value['reserveState'], value['accountingEpoch'], server.TCAP_PROGRAM_ID, *accounts]))
    proof = value['proof']
    data = hashlib.sha256(b'global:account_credit_epoch_v1').digest()[:8] + int(value['total']).to_bytes(8, 'little') + b''.join((bytes.fromhex(v) for v in proof['publicInputs'])) + b''.join((bytes.fromhex(proof[v]) for v in ('proofA', 'proofB', 'proofC')))
    indexes = bytes((keys.index(k) for k in accounts))
    old_hash = hashlib.sha256(b'offline-old-blockhash').digest()
    message = b'\x81\x02\x00' + bytes([len(keys) - 4]) + 12 .to_bytes(4, 'little') + old_hash + bytes([1, len(keys)])
    message += b''.join((bytes(Pubkey.from_string(k)) for k in keys)) + 1400000 .to_bytes(4, 'little') + (64 * 1024 * 1024).to_bytes(4, 'little')
    message += bytes([keys.index(server.TCAP_PROGRAM_ID), len(indexes)]) + len(data).to_bytes(2, 'little') + indexes + data
    fresh_hash = str(Pubkey(hashlib.sha256(b'offline-fresh-blockhash').digest()))
    self.assertEqual(server._verify_private_coordination_message(message, operator, authority, work['kind'], value), old_hash)
    body = {'workId': work['id'], 'crankerPubkey': operator, 'messageBase64': base64.b64encode(message).decode()}
    return (value, work, body, message, fresh_hash, authority, Mock(wraps=signing_key))
