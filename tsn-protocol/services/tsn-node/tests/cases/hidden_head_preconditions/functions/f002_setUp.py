from unittest.mock import AsyncMock
from app.solana_pubkey import Pubkey
import hashlib
from unittest.mock import patch
from server import runtime as server
from cases.hidden_head_preconditions.functions.f003_callback import callback as _case_f003_callback
from functools import partial

def setUp(self):
    tcap = Pubkey.from_string(server.TCAP_PROGRAM_ID)
    self.root, _ = Pubkey.find_program_address([b'tcap:commitment-root:v1'], tcap)
    self.config, _ = Pubkey.find_program_address([b'tcap:global-config:v1'], tcap)
    self.asset = Pubkey(bytes([9]) * 32)
    self.reserve = Pubkey(bytes([10]) * 32)
    self.funding_root, _ = Pubkey.find_program_address([b'tcap:funding-root:v1'], tcap)
    self.epoch = Pubkey.find_program_address([b'tcap:credit-epoch:v1', bytes(self.asset), bytes(8)], tcap)[0]
    self.funding_state = {'address': str(self.funding_root), 'root': (bytes([2]) * 32).hex(), 'count': 1, 'history': []}
    self.records = [bytearray(272), bytearray(124), bytearray(287), bytearray(201)]
    for data, account_name in zip(self.records, ('TcapGlobalConfigV1', 'TcapCommitmentRootStateV1', 'TcapAssetEntryV1', 'TcapReserveStateV1')):
        data[:8] = hashlib.sha256(f'account:{account_name}'.encode()).digest()[:8]
        data[8:10] = b'\x01\x00'
    config, root, asset, reserve = self.records
    config[142:174] = bytes(Pubkey.from_string(server.TSN_PROGRAM_ID))
    config[208:240] = bytes(self.root)
    root[12:44] = bytes([1]) * 32
    root[80:88] = 7 .to_bytes(8, 'little')
    self.records[2] = self.asset_entry()
    self.assertEqual(len(self.records[2]), 287)
    reserve[44:76] = bytes(self.asset)
    reserve[140:148] = 2000 .to_bytes(8, 'little')
    reserve[148:156] = 1000 .to_bytes(8, 'little')
    reserve[156:164] = 1000 .to_bytes(8, 'little')
    self.transition = {'commitmentRoot': str(self.root), 'previousTcapRoot': (bytes([1]) * 32).hex(), 'tcapRootSequence': '8', 'tcapConfig': str(self.config), 'assetEntry': str(self.asset), 'reserveState': str(self.reserve), 'validAfterSlot': '40', 'expiresAtSlot': '100', 'amountCommitment': '03' * 32, 'accountingEpoch': str(self.epoch), 'tokenId': 7, 'fundingRootAccount': str(self.funding_root), 'proof': {'publicInputs': ['01' * 32] * 12 + [self.funding_state['root']]}}
    self.root_patch = patch.object(server, '_read_tcap_shared_replay_root', new=AsyncMock(return_value=(str(self.root), bytes([1]) * 32, 7)))
    self.root_patch.start()
    self.addCleanup(self.root_patch.stop)
    self.funding_patch = patch.object(server, 'read_funding_root', new=AsyncMock(side_effect=partial(_case_f003_callback, self)))
    self.funding_patch.start()
    self.addCleanup(self.funding_patch.stop)
