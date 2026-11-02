"""Offline TIP SBF regression with synthetic approvals and account state.

Run with the root .venv Python after `npm run tip:build`. An optional first
argument selects another SBF artifact for before/after comparison. This test
reads no operator keys or Receiver work and makes no network requests.
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
from solders.keypair import Keypair
from solders.litesvm import LiteSVM
from solders.message import Message
from solders.pubkey import Pubkey
from solders.signature import Signature
from solders.transaction import Transaction
from solders.transaction_metadata import FailedTransactionMetadata

ROOT = Path(__file__).resolve().parents[2]
BINARY = Path(sys.argv.pop(1)) if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else ROOT / 'tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/target/deploy/tins_program.so'
PROGRAM = Pubkey.from_string('TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT')
PAYER = Pubkey.from_bytes(bytes([7]) * 32)
SYSTEM = Pubkey.default()
INSTRUCTIONS = Pubkey.from_string('Sysvar1nstructions1111111111111111111111111')
GLOBAL, GLOBAL_BUMP = Pubkey.find_program_address([b'global-state'], PROGRAM)
ROUTE, ROUTE_BUMP = Pubkey.find_program_address([b'tip:route-merkle-root:v1'], PROGRAM)
# Frozen outputs of the separate native GPRU/Circom-compatible Poseidon adapter.
ROOT_ONE = bytes.fromhex('063c8ac7b6e5036840374a9ae6850e6947690a7b805923950a8acbb2dcf2e241')
ROOT_TWO = bytes.fromhex('0fda8e4e7697f951e6388fa85064e585144f37a9006fab68c79cde2bb0bb1c8e')


def vec(value):
    return struct.pack('<I', len(value)) + value


class Creation:
    def __init__(self, index, large=False):
        self.owner_key = Keypair.from_seed(bytes([index]) * 32)
        self.owner = self.owner_key.pubkey()
        self.lookup = index.to_bytes(32, 'big')
        self.identity = bytes([4]) * 76
        self.recovery = bytes([5]) * 91
        self.seed = bytes([6]) * (874 if large else 28)
        self.metadata = bytes([8]) * 32
        self.nonce = bytes([10]) * 32
        self.expiry = 2000
        key = bytes([9]) * 32
        commitment = hashlib.sha256(b'TSN_GPRU_ELGAMAL_KEY_COMMITMENT_V1\0' + b'\x01' + key).digest()
        # Canonical nonzero scan coordinates isolate TIP hashing/layout behavior.
        self.route_fields = b'\x01\x01' + key + commitment + b'\x01' + (1).to_bytes(32, 'big') + (2).to_bytes(32, 'big') + (3).to_bytes(32, 'big')
        self.tail = self.metadata + struct.pack('<Q', 1) + self.nonce + self.route_fields
        intent = bytes(self.owner) + self.lookup + vec(self.recovery) + vec(self.identity) + vec(self.seed) + self.tail + struct.pack('<q', self.expiry)
        self.intent_hash = hashlib.sha256(b'TSN_TIN_V1_CREATE' + intent).digest()
        self.registry = Pubkey.find_program_address([b'tin-v1', self.lookup], PROGRAM)[0]
        self.owner_recovery = Pubkey.find_program_address([b'tin-v1-owner-recovery', bytes(self.owner)], PROGRAM)[0]
        self.stage = Pubkey.find_program_address([b'tin-v1-create-stage', bytes(self.owner), self.intent_hash], PROGRAM)[0]

    def proof(self):
        message = (
            'TrustLink TIN creation approval\n\nYou are approving the encrypted creation request for your TIN.\n\nREQUEST DETAILS\nIntent reference: '
            + self.intent_hash.hex()
            + '\n\nProtocol: Transfer Identity Protocol (TIP)\n\nVersion: 1\n\nNEXT STEP\nTSN will verify this approval before submission to Solana.\n\nNo funds are transferred by this approval.'
        ).encode()
        data = struct.pack('<BB7H', 1, 0, 16, 65535, 80, 65535, 112, len(message), 65535)
        return Instruction(Pubkey.from_string('Ed25519SigVerify111111111111111111111111111'), data + bytes(self.owner_key.sign_message(message)) + bytes(self.owner) + message, [])

    def accounts(self):
        return [AccountMeta(PAYER, True, True), AccountMeta(GLOBAL, False, True),
                AccountMeta(ROUTE, False, True), AccountMeta(self.registry, False, True),
                AccountMeta(self.owner_recovery, False, True), AccountMeta(INSTRUCTIONS, False, False),
                AccountMeta(SYSTEM, False, False)]

    def direct(self):
        data = b'\x11' + bytes(self.owner) + self.lookup + vec(self.recovery) + vec(self.identity) + vec(self.seed) + self.tail + self.intent_hash + struct.pack('<q', self.expiry)
        return Instruction(PROGRAM, data, self.accounts())

    def initialize_stage(self):
        data = b'\x13' + bytes(self.owner) + self.lookup + self.intent_hash + struct.pack('<III', len(self.identity), len(self.recovery), len(self.seed)) + self.tail + struct.pack('<q', self.expiry)
        return Instruction(PROGRAM, data, [AccountMeta(PAYER, True, True), AccountMeta(self.stage, False, True), AccountMeta(SYSTEM, False, False)])

    def chunks(self):
        for kind, blob in ((0, self.identity), (3, self.recovery), (1, self.seed)):
            for offset in range(0, len(blob), 700):
                yield Instruction(PROGRAM, b'\x14' + struct.pack('<BI', kind, offset) + vec(blob[offset:offset + 700]), [AccountMeta(PAYER, True, True), AccountMeta(self.stage, False, True)])

    def finalize(self):
        return Instruction(PROGRAM, b'\x15' + self.intent_hash, self.accounts() + [AccountMeta(self.stage, False, True)])


class TinRouteSbfTests(unittest.TestCase):
    def setUp(self):
        self.vm = LiteSVM().with_sigverify(False).with_blockhash_check(False)
        self.vm.add_program(PROGRAM, BINARY.read_bytes())
        self.vm.set_account(PAYER, Account(10_000_000_000, b'', SYSTEM))
        self.vm.set_account(GLOBAL, Account(1_000_000, bytes([3, GLOBAL_BUMP]) + bytes(6) + struct.pack('<Q', 100), PROGRAM))
        clock = self.vm.get_clock()
        self.vm.set_clock(Clock(clock.slot, clock.epoch_start_timestamp, clock.epoch, clock.leader_schedule_epoch, 1000))

    def execute(self, instructions, commit=True):
        tx = Transaction.populate(Message([set_compute_unit_limit(1_400_000)] + instructions, PAYER), [Signature.default()])
        result = self.vm.simulate_transaction(tx)
        if isinstance(result, FailedTransactionMetadata):
            return result
        if commit:
            for address, account in result.post_accounts():
                self.vm.set_account(address, account)
        return result

    def success(self, result):
        if isinstance(result, FailedTransactionMetadata):
            self.fail(str(result.err()) + '\n' + '\n'.join(result.meta().logs()))

    def prepare_stage(self, creation):
        self.success(self.execute([creation.initialize_stage()]))
        for chunk in creation.chunks():
            self.success(self.execute([chunk]))

    def assert_created(self, creation, count, expected_root):
        route = self.vm.get_account(ROUTE).data
        self.assertEqual(len(route), 1066)
        self.assertEqual(route[:2], bytes([1, ROUTE_BUMP]))
        self.assertEqual(struct.unpack_from('<Q', route, 34)[0], count)
        self.assertEqual(route[2:34], expected_root)
        self.assertEqual(self.vm.get_account(creation.registry).owner, PROGRAM)
        self.assertEqual(self.vm.get_account(creation.registry).data[8:40], creation.lookup)
        self.assertEqual(self.vm.get_account(creation.owner_recovery).owner, PROGRAM)
        self.assertEqual(struct.unpack_from('<Q', self.vm.get_account(GLOBAL).data, 8)[0], 100 + count)

    def test_staged_second_route_matches_poseidon_and_closes_stage(self):
        first = Creation(1)
        self.success(self.execute([first.proof(), first.direct()]))
        self.assert_created(first, 1, ROOT_ONE)
        second = Creation(2, large=True)
        self.prepare_stage(second)
        self.success(self.execute([second.proof(), second.finalize()]))
        self.assert_created(second, 2, ROOT_TWO)
        stage = self.vm.get_account(second.stage)
        self.assertTrue(stage is None or stage.lamports == 0)

    def test_direct_second_route_matches_same_membership_root(self):
        for index, root in ((1, ROOT_ONE), (2, ROOT_TWO)):
            creation = Creation(index)
            self.success(self.execute([creation.proof(), creation.direct()]))
            self.assert_created(creation, index, root)

    def test_invalid_root_rejects_without_creating_records(self):
        first = Creation(1)
        self.success(self.execute([first.proof(), first.direct()]))
        route = self.vm.get_account(ROUTE)
        invalid_data = bytes([99]) + route.data[1:]
        self.vm.set_account(ROUTE, Account(route.lamports, invalid_data, PROGRAM))
        second = Creation(2, large=True)
        self.prepare_stage(second)
        result = self.execute([second.proof(), second.finalize()])
        self.assertIsInstance(result, FailedTransactionMetadata)
        self.assertIn('Custom(0)', str(result.err()))
        self.assertIsNone(self.vm.get_account(second.registry))
        self.assertIsNone(self.vm.get_account(second.owner_recovery))
        self.assertEqual(self.vm.get_account(ROUTE).data, invalid_data)
        self.assertGreater(self.vm.get_account(second.stage).lamports, 0)

    def test_existing_root_padding_is_validated(self):
        first = Creation(1)
        self.success(self.execute([first.proof(), first.direct()]))
        route = self.vm.get_account(ROUTE)
        second = Creation(2)
        for padding, valid in ((bytes(16), True), (bytes(15) + b'\x01', False)):
            with self.subTest(valid=valid):
                data = route.data + padding
                self.vm.set_account(ROUTE, Account(route.lamports, data, PROGRAM))
                result = self.execute([second.proof(), second.direct()], commit=False)
                if valid:
                    self.success(result)
                    appended = dict(result.post_accounts())[ROUTE].data
                    self.assertEqual(appended[2:34], ROOT_TWO)
                    self.assertEqual(appended[1066:], padding)
                else:
                    self.assertIsInstance(result, FailedTransactionMetadata)
                    self.assertIn('InvalidAccountData', str(result.err()))
                self.assertIsNone(self.vm.get_account(second.registry))


if __name__ == '__main__':
    unittest.main(verbosity=2)
