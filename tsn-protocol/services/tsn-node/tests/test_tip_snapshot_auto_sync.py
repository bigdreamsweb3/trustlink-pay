"""Automatic membership recovery uses confirmed append indices and exact roots."""
import copy
import hashlib
import json
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from pathlib import Path

from app.solana_pubkey import Pubkey, _encode_base58
from gpru_crypto import BABYJUB_BASE8, poseidon_v1
from hidden_head_witness import SparseTree, hex_field
from tip_snapshot_sync import TIP, ROUTE_ROOT, ROOT_BUMP, ensure_tip_snapshot, receipt_appends


def registry_fixture(number):
    lookup = hashlib.sha256(f"lookup-{number}".encode()).digest()
    address, bump = Pubkey.find_program_address([b"tin-v1", lookup], TIP)
    public = bytes([number + 1]) * 32
    key = hashlib.sha256(b"TSN_GPRU_ELGAMAL_KEY_COMMITMENT_V1\0" + b"\1" + public).digest()
    x, y = [v.to_bytes(32, "big") for v in BABYJUB_BASE8]
    policy = hashlib.sha256(b"policy").digest()
    vector = lambda b: len(b).to_bytes(4, "little") + b
    data = b"".join((bytes([1, bump, 1]), bytes(5), lookup, bytes(32), vector(bytes(28)), vector(bytes(20)),
                     bytes(8 + 32), (1).to_bytes(8, "little"), bytes(32), b"\1\1", public, key, b"\1", x, y, policy))
    leaf = poseidon_v1([int.from_bytes(v, "big") % (21888242871839275222246405745257275088548364400416034343698204186575808495617)
                       for v in (lookup, key, x, y, policy)])
    return str(address), data, leaf


REGISTRIES = [registry_fixture(i) for i in range(3)]
ROOTS = [hex_field(SparseTree(32, dict(enumerate([r[2] for r in REGISTRIES[:count]]))).root) for count in (1, 2, 3)]


def receipt(index, *, direct=False, slot=100):
    signature = _encode_base58(bytes([index + 1]) * 64)
    instruction = {"programId": str(TIP), "accounts": [str(Pubkey(bytes([7]) * 32)), str(Pubkey(bytes([8]) * 32)),
                    str(ROUTE_ROOT), REGISTRIES[index][0], str(Pubkey(bytes([9]) * 32)),
                    "Sysvar1nstructions1111111111111111111111111", "11111111111111111111111111111111"],
                   "data": _encode_base58(bytes([17 if direct else 21]) + bytes(32))}
    if not direct:
        instruction["accounts"].append(str(Pubkey(bytes([10]) * 32)))
    return signature, {"slot": slot, "version": "legacy", "meta": {"err": None, "logMessages": [
        f"Program {TIP} invoke [1]", f"Program log: TIP V1 route appended to shared membership root at index={index}",
        f"Program {TIP} success"]}, "transaction": {"signatures": [signature], "message": {"instructions": [instruction]}}}


class TipSnapshotAutoSyncTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.calls = []
        self.root_reads = 0
        self.root_changed = False
        self.receipts = dict(receipt(index, direct=index == 0) for index in range(3))
        self.entries = [{"signature": signature, "slot": value["slot"], "err": None} for signature, value in self.receipts.items()]
        # Deliberately reverse creation order within one slot. Append indices,
        # rather than RPC ordering or timestamps, determine membership order.
        self.entries.reverse()
        self.accounts = {address: data for address, data, _ in REGISTRIES}

    def seed(self, count):
        path = self.directory / f"tip-{ROOTS[count - 1]}.json"
        path.write_text(json.dumps({"version": 1, "leaves": [str(r[2]) for r in REGISTRIES[:count]]}))
        return path

    async def rpc(self, method, params):
        import base64
        self.calls.append((method, copy.deepcopy(params)))
        if method == "getMultipleAccounts":
            values = []
            for address in params[0]:
                if address == str(ROUTE_ROOT):
                    self.root_reads += 1
                    count = 2 if self.root_changed and self.root_reads > 1 else 3
                    data = bytes([1, ROOT_BUMP]) + bytes.fromhex(ROOTS[count - 1]) + count.to_bytes(8, "little") + bytes(1024)
                else:
                    data = self.accounts[address]
                values.append({"owner": str(TIP), "executable": False, "data": [base64.b64encode(data).decode(), "base64"]})
            return {"result": {"context": {"slot": 101}, "value": values}}
        if method == "getSignaturesForAddress":
            self.assertEqual(len(params), 2)
            self.assertEqual(params[1]["commitment"], "confirmed")
            self.assertEqual(params[1]["minContextSlot"], 101)
            return {"result": [] if "before" in params[1] else self.entries}
        if method == "getTransaction":
            return {"result": self.receipts.get(params[0])}
        raise AssertionError(method)

    async def sync(self, **options):
        return await ensure_tip_snapshot(self.directory, ROOTS[2], self.rpc, **options)

    def assert_current_snapshot(self):
        document = json.loads((self.directory / f"tip-{ROOTS[2]}.json").read_text())
        self.assertEqual(document, {"version": 1, "leaves": [str(r[2]) for r in REGISTRIES]})

    async def test_new_tin_auto_extends_snapshot_preserves_old_state_and_reuses_matching_cache(self):
        base = self.seed(2)
        original = base.read_bytes()
        result = await self.sync()
        self.assertEqual(result, {"published": True, "routeCount": 3})
        self.assert_current_snapshot()
        self.assertEqual(base.read_bytes(), original)
        calls = len(self.calls)
        self.assertEqual(await self.sync(), {"published": False, "routeCount": 3})
        self.assertEqual(len(self.calls), calls)

    async def test_cold_node_rebuilds_direct_and_staged_creations_in_append_order(self):
        await self.sync()
        self.assert_current_snapshot()

    async def test_multiple_new_tins_and_paginated_history(self):
        self.seed(1)
        original = self.rpc
        first = self.entries[:1]
        remaining = self.entries[1:]
        async def paginated(method, params):
            if method == "getSignaturesForAddress":
                return {"result": remaining if "before" in params[1] else first}
            return await original(method, params)
        await ensure_tip_snapshot(self.directory, ROOTS[2], paginated)
        self.assert_current_snapshot()

    async def test_missing_receipt_or_append_history_never_publishes(self):
        self.seed(2)
        signature = self.entries[0]["signature"]
        self.receipts[signature] = None
        with self.assertRaisesRegex(RuntimeError, "receipt is missing"):
            await self.sync()
        self.entries = self.entries[1:]
        with self.assertRaisesRegex(RuntimeError, "history is incomplete"):
            await self.sync()
        self.assertFalse((self.directory / f"tip-{ROOTS[2]}.json").exists())

    async def test_failed_creation_is_skipped_and_duplicate_indices_are_rejected(self):
        self.seed(2)
        self.entries.insert(0, {"signature": "failed", "slot": 100, "err": {"InstructionError": [0, "failed"]}})
        await self.sync()
        self.assertFalse(any(method == "getTransaction" and params[0] == "failed" for method, params in self.calls))
        (self.directory / f"tip-{ROOTS[2]}.json").unlink()
        (self.directory / f"tip-{ROOTS[1]}.json").unlink()
        self.seed(1)
        signature, tx = receipt(2)
        other_signature = _encode_base58(bytes([22]) * 64)
        tx["transaction"]["signatures"] = [other_signature]
        self.receipts[other_signature] = tx
        self.entries.insert(2, {"signature": other_signature, "slot": 100, "err": None})
        with self.assertRaisesRegex(ValueError, "repeats a creation index"):
            await self.sync()

    async def test_verified_base_does_not_require_pruned_older_receipts(self):
        self.seed(2)
        for entry in self.entries[1:]:
            self.receipts[entry["signature"]] = None
        await self.sync()
        self.assert_current_snapshot()

    async def test_wrong_registry_or_root_change_cannot_publish(self):
        self.seed(2)
        address, data, _ = REGISTRIES[2]
        self.accounts[address] = data[:-32] + bytes([1]) * 32
        with self.assertRaisesRegex(ValueError, "confirmed chain root"):
            await self.sync()
        self.accounts[address] = data
        self.root_changed = True
        self.root_reads = 0
        with self.assertRaisesRegex(RuntimeError, "root changed during"):
            await self.sync()
        self.assertFalse((self.directory / f"tip-{ROOTS[2]}.json").exists())

    async def test_corrupt_current_snapshot_is_rejected_without_using_old_state(self):
        self.seed(2)
        current = self.seed(3)
        current.write_text(json.dumps({"version": 1, "leaves": ["1"]}))
        with self.assertRaisesRegex(ValueError, "selected root"):
            await self.sync()
        self.assertEqual(self.calls, [])

    async def test_read_only_preview_verifies_real_pipeline_without_publishing(self):
        self.seed(2)
        self.assertEqual(await self.sync(publish_snapshot=False), {"published": False, "routeCount": 3})
        self.assertFalse((self.directory / f"tip-{ROOTS[2]}.json").exists())

    async def test_node_settlement_synchronizes_before_proving_and_blocks_on_missing_history(self):
        import server
        self.seed(2)
        async def node_rpc(method, params):
            if method == "getSlot":
                raise RuntimeError("stop after synchronized snapshot")
            return await self.rpc(method, params)
        with patch.dict(server.os.environ, {"GPRU_HIDDEN_HEAD_WITNESS_DIR": str(self.directory)}), \
             patch.object(server, "_settlement_funding_context", new=AsyncMock(return_value=(
                 SimpleNamespace(recipientTin="1234567890", recipientHash="ab" * 32), {}, {}))), \
             patch.object(server, "read_onchain_tin_tip_route", new=AsyncMock(return_value={"ownerPubkeyHash": "ab" * 32})), \
             patch.object(server, "_read_tcap_shared_replay_root", new=AsyncMock(return_value=("synthetic-root", bytes(32), 3))), \
             patch.object(server, "_read_gpru_proof_accounts", new=AsyncMock(return_value=(ROOTS[2], b"", 0))), \
             patch.object(server, "solana_rpc", new=AsyncMock(side_effect=node_rpc)), \
             patch.object(server, "prove_hidden_head_credit", new=AsyncMock()) as prover:
            with self.assertRaisesRegex(RuntimeError, "stop after synchronized snapshot"):
                await server._construct_verified_tcap_transition({})
            self.assert_current_snapshot()
            prover.assert_not_awaited()
            (self.directory / f"tip-{ROOTS[2]}.json").unlink()
            self.entries = []
            with self.assertRaisesRegex(RuntimeError, "append history is incomplete"):
                await server._construct_verified_tcap_transition({})
            prover.assert_not_awaited()

    def test_spoofed_or_truncated_logs_and_wrong_instruction_binding_are_rejected(self):
        signature, tx = receipt(2)
        tx["transaction"]["message"]["instructions"][0]["accounts"][2] = REGISTRIES[0][0]
        with self.assertRaisesRegex(ValueError, "account layout"):
            receipt_appends(tx, signature, 100)
        signature, tx = receipt(2)
        tx["meta"]["logMessages"].pop()
        with self.assertRaisesRegex(ValueError, "truncated"):
            receipt_appends(tx, signature, 100)
        signature, tx = receipt(2)
        fake_program = str(Pubkey(bytes([11]) * 32))
        tx["meta"]["logMessages"] = [f"Program {fake_program} invoke [1]",
            "Program log: TIP V1 route appended to shared membership root at index=2", f"Program {fake_program} success"]
        self.assertEqual(receipt_appends(tx, signature, 100), [])


if __name__ == "__main__":
    unittest.main()
