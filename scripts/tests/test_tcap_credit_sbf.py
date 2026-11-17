"""Offline TCAP credit argument/account regression using synthetic state.

Run with the root .venv Python after building TCAP. An optional first argument
selects an isolated TCAP SBF artifact for before/after comparison; a second
selects the TSNP artifact. Direct credit stops at a deliberately invalid
authorization commitment; TSNP CPI stops at an expired slot window. Both are
after funding validation. The fixture uses no real proof, operator keys,
Receiver work, or network requests.
"""
import hashlib
import struct
import sys
import unittest
from pathlib import Path

from solders.account import Account
from solders.clock import Clock
from solders.compute_budget import set_compute_unit_limit
from solders.instruction import AccountMeta, Instruction
from solders.litesvm import LiteSVM
from solders.message import Message
from solders.pubkey import Pubkey
from solders.signature import Signature
from solders.transaction import Transaction
from solders.transaction_metadata import FailedTransactionMetadata

ROOT = Path(__file__).resolve().parents[2]
BINARY = Path(sys.argv.pop(1)) if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else ROOT / 'tsn-protocol/programs/tcap-protocol/target/deploy/tcap.so'
TSNP_BINARY = Path(sys.argv.pop(1)) if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else ROOT / 'tsn-protocol/programs/tsn/protocol/target/deploy/trustlink_escrow.so'
TCAP = Pubkey.from_string('tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF')
TSNP = Pubkey.from_string('TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V')
GPRU = Pubkey.from_string('6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR')
SYSTEM = Pubkey.default()
INSTRUCTIONS = Pubkey.from_string('Sysvar1nstructions1111111111111111111111111')
PAYER = Pubkey.from_bytes(bytes([7]) * 32)
REGISTRY = Pubkey.from_bytes(bytes([8]) * 32)
TOKEN = Pubkey.from_string('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
MINT = Pubkey.from_bytes(bytes([9]) * 32)
CONFIG, CONFIG_BUMP = Pubkey.find_program_address([b'tcap:global-config:v1'], TCAP)
STATE, STATE_BUMP = Pubkey.find_program_address([b'tcap:commitment-root:v1'], TCAP)
FUNDING, FUNDING_BUMP = Pubkey.find_program_address([b'tcap:funding-root:v1'], TCAP)
ASSET, ASSET_BUMP = Pubkey.find_program_address([b'tcap:asset-entry:v1', bytes(REGISTRY), bytes(TOKEN), bytes(MINT)], TCAP)
RESERVE, _ = Pubkey.find_program_address([b'tcap:reserve-state:v1', bytes(ASSET)], TCAP)
EPOCH, EPOCH_BUMP = Pubkey.find_program_address([b'tcap:credit-epoch:v1', bytes(ASSET), bytes(8)], TCAP)
AUTH_SIGNER, _ = Pubkey.find_program_address([b'tsn:tcap-authorization:v1', (7).to_bytes(32, 'big')], TSNP)
TIP_ROOT = Pubkey.from_bytes(bytes([10]) * 32)
VERIFIER = Pubkey.from_bytes(bytes([11]) * 32)
MOTHER, MOTHER_BUMP = Pubkey.find_program_address([b'tsn_mother_escrow'], TSNP)
FUNDING_CURRENT = int.from_bytes(bytes([9]) * 32, 'big')
FUNDING_RETAINED = int.from_bytes(bytes([8]) * 32, 'big')
BN254_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617


def discriminator(kind, name):
    return hashlib.sha256(f'{kind}:{name}'.encode()).digest()[:8]


def scalar(value):
    return value.to_bytes(32, 'big')


class TcapCreditSbfTests(unittest.TestCase):
    def setUp(self):
        self.vm = LiteSVM().with_sigverify(False).with_blockhash_check(False)
        self.vm.add_program(TCAP, BINARY.read_bytes())
        self.vm.set_account(PAYER, Account(10_000_000_000, b'', SYSTEM))
        # Executable stand-ins satisfy address/executable constraints only;
        # this fixture fails before invoking either program.
        for address in (TSNP, GPRU):
            self.vm.add_program(address, BINARY.read_bytes())
        # Full-width canonical current/retained roots: deposit counts 3 and 4.
        funding = (discriminator('account', 'TcapFundingMerkleRootV1')
                   + struct.pack('<HHB', 2, 1, FUNDING_BUMP) + scalar(FUNDING_CURRENT)
                   + struct.pack('<QI', 4, 32) + bytes(32 * 32)
                   + struct.pack('<I', 128) + scalar(FUNDING_RETAINED) + struct.pack('<Q', 3)
                   + scalar(FUNDING_CURRENT) + struct.pack('<Q', 4) + bytes(40 * 126)
                   + struct.pack('<HH', 2, 2))
        self.set_tcap(FUNDING, funding)
        config = (discriminator('account', 'TcapGlobalConfigV1') + struct.pack('<HHH', 1, 1, 2)
                  + bytes(PAYER) * 2 + bytes(REGISTRY) + bytes(PAYER) + bytes(TSNP) + bytes(GPRU)
                  + bytes([1, 0]) + bytes(STATE) + struct.pack('<HBB', 1, 0, CONFIG_BUMP))
        self.set_tcap(CONFIG, config)
        state = (discriminator('account', 'TcapCommitmentRootStateV1') + struct.pack('<HH', 1, 1)
                 + scalar(3) + scalar(2) + struct.pack('<IQB', 1, 0, 0)
                 + bytes(VERIFIER) + bytes([1, 0, STATE_BUMP]))
        self.set_tcap(STATE, state)
        asset = (discriminator('account', 'TcapAssetEntryV1') + struct.pack('<HH', 1, 1)
                 + bytes(REGISTRY) + struct.pack('<I', 1) + bytes(TOKEN) + bytes(MINT)
                 + struct.pack('<I', 1) + scalar(12) + bytes(RESERVE) + bytes(SYSTEM) * 2
                 + bytes([6, 1, 1, 0, 0, 0, 0]) + scalar(13) + bytes([1, 1, 0, ASSET_BUMP]))
        self.set_tcap(ASSET, asset)
        reserve = (discriminator('account', 'TcapReserveStateV1') + struct.pack('<HH', 1, 1)
                   + bytes(SYSTEM) + bytes(ASSET) + bytes(SYSTEM) * 2
                   + struct.pack('<6Q', 1000, 1000, 0, 0, 0, 0)
                   + bytes([1, 0, 0, 0, 0]) + struct.pack('<Q', 0))
        self.set_tcap(RESERVE, reserve)
        self.assertEqual((len(config), len(state), len(asset), len(reserve), len(funding)), (244, 124, 287, 201, 6209))

    def set_tcap(self, address, data):
        self.vm.set_account(address, Account(10_000_000, data, TCAP))

    def execute(self, selected, existing_epoch=False, via_tsnp=False):
        if existing_epoch:
            epoch = (discriminator('account', 'TcapCreditEpochV1') + struct.pack('<HB', 1, EPOCH_BUMP)
                     + bytes(ASSET) + struct.pack('<QI', 0, 1) + scalar(14) * 2
                     + struct.pack('<QQB', 0, 0, 0))
            self.set_tcap(EPOCH, epoch)
        digest, authorization, expires = scalar(7), scalar(6), 1_000_000
        if via_tsnp:
            self.vm.add_program(TSNP, TSNP_BINARY.read_bytes())
            mother = (discriminator('account', 'MotherEscrow') + bytes(PAYER) + bytes(SYSTEM)
                      + scalar(15) + struct.pack('<qq7HQqB', 3600, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, MOTHER_BUMP))
            self.vm.set_account(MOTHER, Account(10_000_000, mother, TSNP))
            clock = self.vm.get_clock()
            self.vm.set_clock(Clock(2, clock.epoch_start_timestamp, clock.epoch, clock.leader_schedule_epoch, clock.unix_timestamp))
            expires = 1
            digest = hashlib.sha256(b'TSN_GPRU_TCAP_CREDIT_PRIVATE_V2\0' + bytes(STATE) + scalar(3)
                                    + struct.pack('<QQQ', 1, 0, expires) + scalar(5) + struct.pack('<I', 1)
                                    + scalar(11) + scalar(selected) + bytes(EPOCH) + bytes(FUNDING)).digest()
            authorization = scalar(int.from_bytes(digest, 'big') % BN254_MODULUS)
        inputs = [scalar(3), scalar(4), scalar(5), scalar(6), scalar(11)] + [scalar(1)] * 7 + [scalar(selected)]
        proof = b''.join(inputs) + bytes(64 + 128 + 64) + struct.pack('<BI', 1, 1) + scalar(5) + authorization
        name = 'tsn_register_tcap_credit_authorization_v3' if via_tsnp else 'credit_gpru_memo_v2'
        values = scalar(5) + scalar(11) if via_tsnp else scalar(11) + scalar(5)
        data = (discriminator('global', name) + digest + struct.pack('<QQ', 0, expires)
                + scalar(3) + struct.pack('<QI', 1, 1) + values + proof)
        self.assertEqual(len(data), 905)
        keys = [PAYER, CONFIG, STATE, ASSET, RESERVE, TSNP, AUTH_SIGNER,
                TIP_ROOT, VERIFIER, INSTRUCTIONS, GPRU, FUNDING, EPOCH, SYSTEM]
        program, writable = TCAP, (0, 2, 12)
        if via_tsnp:
            signer = Pubkey.find_program_address([b'tsn:tcap-authorization:v1', digest], TSNP)[0]
            keys = [PAYER, MOTHER, TCAP, TSNP, CONFIG, ASSET, STATE, RESERVE, signer,
                    TIP_ROOT, VERIFIER, INSTRUCTIONS, GPRU, FUNDING, EPOCH, SYSTEM]
            program, writable = TSNP, (0, 6, 14)
        ix = Instruction(program, data, [AccountMeta(address, index == 0, index in writable) for index, address in enumerate(keys)])
        message = Message([set_compute_unit_limit(1_400_000), ix], PAYER)
        tx = Transaction.populate(message, [Signature.default()])
        return self.vm.simulate_transaction(tx)

    def assert_error(self, result, code, source):
        self.assertIsInstance(result, FailedTransactionMetadata)
        logs = result.meta().logs()
        self.assertIn(f'Custom({code})', str(result.err()), '\n'.join(logs))
        self.assertTrue(any(source in line for line in logs), '\n'.join(logs))

    def test_current_and_retained_funding_reach_authorization_check(self):
        # Deliberately mismatched authorization commitment (6 instead of 7)
        # proves exact selected-root/account decoding without accepting a credit.
        for existing in (False, True):
            for selected in (FUNDING_RETAINED, FUNDING_CURRENT):
                with self.subTest(selected=selected, existing_epoch=existing):
                    self.assert_error(self.execute(selected, existing), 6008, 'InvalidTsnAuthorizationSigner')

    def test_unrecorded_zero_and_noncanonical_funding_roots_reject(self):
        for selected in (0, 10, (1 << 256) - 1):
            with self.subTest(selected=selected):
                self.assert_error(self.execute(selected), 6023, 'InvalidFundingRoot')

    def test_tsnp_cpi_preserves_current_and_retained_funding_root(self):
        for existing in (False, True):
            for selected in (FUNDING_RETAINED, FUNDING_CURRENT):
                with self.subTest(selected=selected, existing_epoch=existing):
                    result = self.execute(selected, existing, via_tsnp=True)
                    self.assert_error(result, 6012, 'AuthorizationExpired')
                    self.assertIn(f'Program {TCAP} invoke [2]', result.meta().logs())

    def test_malformed_retained_history_rejects_current_root(self):
        funding = self.vm.get_account(FUNDING)
        for offset, value in ((1117, struct.pack('<Q', 2)), (1125, scalar(10))):
            with self.subTest(offset=offset):
                invalid = funding.data[:offset] + value + funding.data[offset + len(value):]
                self.set_tcap(FUNDING, invalid)
                self.assert_error(self.execute(FUNDING_CURRENT), 6023, 'InvalidFundingRoot')


if __name__ == '__main__':
    unittest.main(verbosity=2)
