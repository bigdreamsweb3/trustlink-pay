from pathlib import Path
from app.solana_pubkey import Pubkey
from cases.hidden_head_transport.origin import SOURCE_FILE as __file__
from credit_amount import commitment as amount_commitment
import base64
from dbrix_transaction_record import encrypt_transaction_record_v1
import hashlib
import json
from server import runtime as server
import shutil
import subprocess
import tempfile
from cases.hidden_head_transport.functions.f002_field import field as _case_f002_field
from cases.hidden_head_transport.functions.f003_account import account as _case_f003_account

# Maximum integer widths and non-repeating commitments exercise the
# full encrypted owner record, rather than a one-character Memo body.
# These are serialization fixtures, not valid Groth16 proofs.
@classmethod
def setUpClass(cls):
    field = _case_f002_field
    account = _case_f003_account
    tcap = Pubkey.from_string(server.TCAP_PROGRAM_ID)
    public_inputs = [field(f'offline public input {index}') for index in range(13)]
    commitment_root = Pubkey.find_program_address([b'tcap:commitment-root:v1'], tcap)[0]
    asset_entry = account('offline asset')
    accounting_epoch = str(Pubkey.find_program_address([b'tcap:credit-epoch:v1', bytes(Pubkey.from_string(asset_entry)), bytes(8)], tcap)[0])
    funding_root = str(Pubkey.find_program_address([b'tcap:funding-root:v1'], tcap)[0])
    blinding = field('offline amount blinding')
    amount = str(2 ** 64 - 1)
    amount_hash = format(amount_commitment(2 ** 32 - 1, int(amount), int(blinding, 16), int(public_inputs[4], 16)), '064x')
    digest = hashlib.sha256(b''.join((b'TSN_GPRU_TCAP_CREDIT_PRIVATE_V2\x00', bytes(commitment_root), bytes.fromhex(public_inputs[0]), (2 ** 64 - 1).to_bytes(8, 'little'), 50 .to_bytes(8, 'little'), 1000 .to_bytes(8, 'little'), bytes.fromhex(amount_hash), (2 ** 32 - 1).to_bytes(4, 'little'), bytes.fromhex(public_inputs[4]), bytes.fromhex(public_inputs[12]), bytes(Pubkey.from_string(accounting_epoch)), bytes(Pubkey.from_string(funding_root))))).digest()
    authorization = (int.from_bytes(digest, 'big') % server.BN254_SCALAR_MODULUS).to_bytes(32, 'big').hex()
    cls.operator = account('offline operator')
    cls.authority = account('offline Mother')
    cls.blockhash = account('offline blockhash')
    transition = {'commitmentRoot': str(commitment_root), 'fundingRootAccount': funding_root, 'accountingEpoch': accounting_epoch, 'tcapConfig': str(Pubkey.find_program_address([b'tcap:global-config:v1'], tcap)[0]), 'assetEntry': asset_entry, 'reserveState': account('offline reserve'), 'authorizationDigest': digest.hex(), 'previousTcapRoot': public_inputs[0], 'tcapRootSequence': str(2 ** 64 - 1), 'tokenId': 2 ** 32 - 1, 'amountCommitment': amount_hash, 'nullifier': public_inputs[4], 'validAfterSlot': '50', 'expiresAtSlot': '1000', 'proof': {'publicInputs': public_inputs, 'proofA': '01' * 64, 'proofB': '02' * 128, 'proofC': '03' * 64, 'actionKind': 1, 'tokenId': 2 ** 32 - 1, 'amountCommitment': amount_hash, 'authorizationCommitment': authorization}}
    memo = encrypt_transaction_record_v1(record={'version': 2, 'recordType': 'tsn-gpru-balance-action-v2', 'amountCommitment': amount_hash, 'amountBlinding': blinding, 'sequence': str(2 ** 64 - 1), 'previousMemoCommitment': field('offline previous Memo'), 'actionCommitment': public_inputs[3], 'authorizationCommitment': authorization, 'nullifier': public_inputs[4], 'actionKind': 1, 'tokenId': transition['tokenId'], 'amountBaseUnits': amount}, shared_point=bytes([10]) * 32, record_ephemeral_public_key=bytes([11]) * 32, dna=bytes([12]) * 32, encrypted_blinding_delta=public_inputs[9], delta_ephemeral_public_x=public_inputs[10], delta_ephemeral_public_y=public_inputs[11], memo_binding={'successorPortfolioRoot': public_inputs[6], 'successorBalanceX': public_inputs[7], 'successorBalanceY': public_inputs[8], 'actionCommitment': public_inputs[3], 'authorizationCommitment': authorization, 'nullifier': public_inputs[4]})
    transition.update(memo)
    transition.update(dna='0c' * 32, recordEphemeralPublicKey='0b' * 32, actionCommitment=public_inputs[3])
    public_inputs[2] = memo['memoCommitmentField']
    fixture = {'transition': transition, 'operator': cls.operator, 'authority': cls.authority, 'blockhash': cls.blockhash, 'motherEscrow': str(server.get_mother_escrow_pda()), 'tipRouteRoot': str(Pubkey.find_program_address([b'tip:route-merkle-root:v1'], Pubkey.from_string(server.TINS_PROGRAM_ID))[0]), 'gpruVerifier': str(Pubkey.find_program_address([b'gpru:hidden-head-verifier:v1'], Pubkey.from_string(server.GPRU_PROGRAM_ID))[0])}
    cranker = Path(__file__).resolve().parents[2] / 'tsn-cranker-op-daemon'
    with tempfile.TemporaryFile() as fixture_input:
        fixture_input.write(json.dumps(fixture).encode('utf-8'))
        fixture_input.seek(0)
        result = subprocess.run([shutil.which('node') or 'node', '--import', 'tsx', 'tests/settlement-v1-fixture.ts'], cwd=cranker, stdin=fixture_input, text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise AssertionError(f'Offline DBrix V1 builder failed: {result.stderr}')
    cls.transport = json.loads(result.stdout)
    cls.transition = transition
    cls.message = base64.b64decode(cls.transport['messageBase64'], validate=True)
