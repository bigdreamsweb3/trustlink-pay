import base64
import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from funding_note import NOTE_DOMAIN, funded_leaf, funding_nullifier, validate_funding_note
from funding_snapshot_sync import (
    decode_append_events, decode_funding_root, ensure_funding_snapshot,
    funding_membership, funding_root_address, publish_snapshot, validate_snapshot,
)
from gpru_crypto import BABYJUB_FIELD, poseidon_v1
from hidden_head_witness import SparseTree, hex_field


def note(secret=1, blinding=2):
    return {"version": 1, "secret": hex_field(secret), "blinding": hex_field(blinding),
            "commitment": hex_field(poseidon_v1([NOTE_DOMAIN, secret, blinding]))}


def root_account(leaves):
    _, bump = funding_root_address()
    tree = SparseTree(32, dict(enumerate(leaves)))
    data = (hashlib.sha256(b"account:TcapFundingMerkleRootV1").digest()[:8]
            + b"\x01\x00\x01\x00" + bytes([bump]) + tree.root.to_bytes(32, "big")
            + len(leaves).to_bytes(8, "little") + (32).to_bytes(4, "little") + bytes(1024))
    return {"owner": "tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF", "data": [base64.b64encode(data).decode(), "base64"]}


def append_event(index, opening, token, amount, leaves):
    address, _ = funding_root_address()
    leaf = funded_leaf(opening["commitment"], token, amount)
    root = SparseTree(32, dict(enumerate(leaves))).root
    event = (hashlib.sha256(b"event:PrivateFundingDepositedV1").digest()[:8] + bytes(address)
             + index.to_bytes(8, "little") + bytes.fromhex(opening["commitment"])
             + token.to_bytes(4, "little") + amount.to_bytes(8, "little")
             + leaf.to_bytes(32, "big") + root.to_bytes(32, "big"))
    program = root_account([])["owner"]
    return {"meta": {"err": None, "logMessages": [f"Program {program} invoke [1]",
            "Program data: " + base64.b64encode(event).decode(), f"Program {program} success"]}}


class FundingNoteTests(unittest.TestCase):
    def test_shared_sdk_rust_poseidon_vectors(self):
        opening = note()
        self.assertEqual(opening["commitment"], "25e2b221e22ce1d857cb8b21b104432d92f39acf19f14b45818a471f03bf1756")
        self.assertEqual(funding_nullifier(opening), "1ee2226d38d357bcd4ed079b93ff555c1af28a4b5ff97562deec82704fcc6485")
        self.assertEqual(hex_field(funded_leaf(opening["commitment"], 7, 1000)), "1c546aeaea68bc79050f46c8926e37ff7d0753ca5b2b2dcbd19295c3320c9838")

    def test_opening_is_canonical_nonzero_and_bound_to_commitment(self):
        opening = note()
        self.assertEqual(validate_funding_note(opening), opening)
        self.assertEqual(validate_funding_note(note(blinding=0)), note(blinding=0))
        for changes in ({"secret": hex_field(3)}, {"blinding": hex_field(4)}, {"secret": hex_field(0)},
                        {"secret": BABYJUB_FIELD.to_bytes(32, "big").hex()}, {"extra": "private"}, {"version": True}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate_funding_note({**opening, **changes})

    def test_one_note_has_one_nullifier_independent_of_amount_recipient_or_retry(self):
        opening = note()
        original = funding_nullifier(opening)
        self.assertEqual(original, funding_nullifier(copy.deepcopy(opening)))
        self.assertNotEqual(original, funding_nullifier(note(secret=3)))
        # Different blinding cannot turn one secret into a second spend identity.
        self.assertEqual(original, funding_nullifier(note(blinding=5)))

    def test_amount_asset_and_opening_are_required_by_funded_membership(self):
        opening = note()
        leaf = funded_leaf(opening["commitment"], 7, 1000)
        tree = SparseTree(32, {0: leaf})
        snapshot = {"root": hex_field(tree.root), "leaves": [leaf]}
        self.assertEqual(funding_membership(snapshot, opening["commitment"], 7, 1000)["fundingIndex"], 0)
        for commitment, token, amount in ((opening["commitment"], 8, 1000), (opening["commitment"], 7, 1001),
                                           (note(secret=3)["commitment"], 7, 1000)):
            with self.assertRaisesRegex(ValueError, "no membership"):
                funding_membership(snapshot, commitment, token, amount)

    def test_unallocated_wrong_owner_or_malformed_root_fails(self):
        valid = root_account([funded_leaf(note()["commitment"], 7, 1000)])
        self.assertEqual(decode_funding_root(valid)["count"], 1)
        for changed in (None, {**valid, "owner": "wrong"}, {**valid, "data": [base64.b64encode(bytes(1081)).decode()]}):
            with self.assertRaises(ValueError):
                decode_funding_root(changed)
        zero_root = bytearray(base64.b64decode(valid["data"][0]))
        zero_root[13:45] = bytes(32)
        with self.assertRaisesRegex(ValueError, "nonzero"):
            decode_funding_root({**valid, "data": [base64.b64encode(zero_root).decode(), "base64"]})

    def test_events_require_success_and_tcap_invocation_and_recompute_actual_leaf(self):
        opening = note()
        leaf = funded_leaf(opening["commitment"], 7, 1000)
        receipt = append_event(0, opening, 7, 1000, [leaf])
        address = str(funding_root_address()[0])
        self.assertEqual(decode_append_events(receipt, address)[0]["leaf"], leaf)
        failed = copy.deepcopy(receipt)
        failed["meta"]["err"] = {"InstructionError": [0, "InvalidArgument"]}
        with self.assertRaises(ValueError):
            decode_append_events(failed, address)
        outside = copy.deepcopy(receipt)
        outside["meta"]["logMessages"] = [receipt["meta"]["logMessages"][1]]
        self.assertEqual(decode_append_events(outside, address), [])
        tampered = copy.deepcopy(receipt)
        event = bytearray(base64.b64decode(tampered["meta"]["logMessages"][1][14:]))
        event[84] ^= 1  # Actual deposit amount; cannot retain the original leaf.
        tampered["meta"]["logMessages"][1] = "Program data: " + base64.b64encode(event).decode()
        with self.assertRaisesRegex(ValueError, "leaf"):
            decode_append_events(tampered, address)

    def test_public_snapshot_has_no_openings_and_is_immutable(self):
        leaves = [funded_leaf(note()["commitment"], 7, 1000)]
        root = hex_field(SparseTree(32, {0: leaves[0]}).root)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            publish_snapshot(path, root, leaves)
            publish_snapshot(path, root, leaves)
            data = json.loads((path / f"funding-{root}.json").read_text())
            self.assertEqual(set(data), {"version", "leaves"})
            self.assertEqual(validate_snapshot(data, root, 1), leaves)
            with self.assertRaisesRegex(ValueError, "unsupported field set"):
                validate_snapshot({**data, "version": True}, root, 1)
            with self.assertRaisesRegex(ValueError, "different funding snapshot"):
                publish_snapshot(path, root, [leaves[0] + 1])


class FundingSnapshotTests(unittest.IsolatedAsyncioTestCase):
    async def test_cached_prefix_extends_only_when_final_chain_root_matches(self):
        openings = [note(), note(secret=3)]
        leaves = [funded_leaf(opening["commitment"], 7, 1000) for opening in openings]
        selected = {**decode_funding_root(root_account(leaves)), "address": str(funding_root_address()[0])}
        receipt = append_event(1, openings[1], 7, 1000, leaves)
        receipt["transaction"] = {"signatures": ["latest-public-mock-signature"]}
        fetched = []
        async def rpc(method, params):
            if method == "getSignaturesForAddress":
                return {"result": [{"signature": "latest-public-mock-signature", "err": None}]}
            if method == "getTransaction":
                fetched.append(params[0])
                return {"result": receipt}
            return {"result": {"value": root_account(leaves), "context": {"slot": 10}}}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            prefix_root = hex_field(SparseTree(32, {0: leaves[0]}).root)
            publish_snapshot(path, prefix_root, leaves[:1])
            self.assertEqual((await ensure_funding_snapshot(path, selected, rpc))["leaves"], leaves)
            self.assertEqual(fetched, ["latest-public-mock-signature"])
        # A well-formed cached tree is still not authority for a different prefix.
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            wrong_leaf = funded_leaf(note(secret=5)["commitment"], 7, 1000)
            publish_snapshot(path, hex_field(SparseTree(32, {0: wrong_leaf}).root), [wrong_leaf])
            with self.assertRaisesRegex(ValueError, "chain-selected root"):
                await ensure_funding_snapshot(path, selected, rpc)
            self.assertFalse((path / f"funding-{selected['root']}.json").exists())

    async def test_cold_reconstruction_matches_root_and_changed_root_stops_publication(self):
        opening = note()
        leaves = [funded_leaf(opening["commitment"], 7, 1000)]
        selected = {**decode_funding_root(root_account(leaves)), "address": str(funding_root_address()[0])}
        receipt = append_event(0, opening, 7, 1000, leaves)
        receipt["transaction"] = {"signatures": ["public-mock-signature"]}
        async def rpc(method, params):
            if method == "getSignaturesForAddress":
                return {"result": [{"signature": "public-mock-signature", "err": None}]}
            if method == "getTransaction":
                return {"result": receipt}
            return {"result": {"value": root_account(leaves), "context": {"slot": 10}}}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            result = await ensure_funding_snapshot(path, selected, rpc)
            self.assertTrue(result["published"])
            self.assertFalse((await ensure_funding_snapshot(path, selected, rpc))["published"])
        async def changed_rpc(method, params):
            if method == "getAccountInfo":
                return {"result": {"value": root_account(leaves + [2]), "context": {"slot": 11}}}
            return await rpc(method, params)
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "TCAP_FUNDING_ROOT_CHANGED_BEFORE_SETTLEMENT"):
                await ensure_funding_snapshot(Path(directory), selected, changed_rpc)
            self.assertEqual(list(Path(directory).iterdir()), [])


if __name__ == "__main__":
    unittest.main()
