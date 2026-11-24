"""Owner authorization, atomic state preparation and conservation regressions."""
import copy
import hashlib
import unittest
from nacl.signing import SigningKey
from core import (
    BABYJUB_FIELD, BABYJUB_SUBORDER, MAX_U64, MAX_BALANCE, PUBLIC_FIELDS,
    balance_point, hex_field, poseidon_v1, prepare_transfer, route_fields, state_trees,
)
from fixtures import make_fixture, refresh_root, sign_approval


class TransferCoreTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = make_fixture()

    def setUp(self):
        self.args = copy.deepcopy(self.fixture["args"])

    def assert_rejected_without_mutation(self, args, pattern):
        before = copy.deepcopy(args)
        with self.assertRaisesRegex(ValueError, pattern):
            prepare_transfer(**args)
        self.assertEqual(args, before)

    def test_atomic_conservation_and_other_assets_preserved(self):
        before = copy.deepcopy(self.args)
        result = prepare_transfer(**self.args)
        self.assertEqual(self.args, before)
        self.assertEqual(result["witness"]["newBalances"], [70, 0])
        sender_key = hex_field(route_fields(self.args["sender_route"])[1])
        recipient_key = hex_field(route_fields(self.args["recipient_route"])[1])
        self.assertEqual(tuple(int(result["candidate"]["heads"][sender_key]["portfolio"]["1"][axis]) for axis in ("x", "y")), balance_point(70, 54))
        self.assertEqual(tuple(int(result["candidate"]["heads"][recipient_key]["portfolio"]["1"][axis]) for axis in ("x", "y")), balance_point(55, 64))
        self.assertEqual(result["nextRootSequence"], 13)
        self.assertEqual(result["accounting"]["entryCount"], 1)
        self.assertTrue(all(value == 0 for key, value in result["accounting"].items() if key.endswith("Delta")))
        self.assertEqual(result["reserve"], before["reserve"])
        for route in (self.args["sender_route"], self.args["recipient_route"]):
            key = hex_field(route_fields(route)[1])
            self.assertEqual(result["candidate"]["heads"][key]["portfolio"]["7"], before["state"]["heads"][key]["portfolio"]["7"])
            self.assertEqual(int(result["candidate"]["heads"][key]["sequence"]), int(before["state"]["heads"][key]["sequence"]) + 1)
        heads, spent, _ = state_trees(result["candidate"])
        self.assertEqual(poseidon_v1([heads.root, spent.root]), result["public"]["newGlobalRoot"])
        self.assertEqual(set(result["public"]), set(PUBLIC_FIELDS))
        self.assertTrue({"amount", "oldBalances", "oldBlindings", "nonce", "routeKeys"}.isdisjoint(result["public"]))
        result["witness"]["memoCommitments"][0] += 1
        self.assertNotEqual(result["witness"]["memoCommitments"], result["public"]["memoCommitments"])

    def test_first_recipient_and_full_sender_spend(self):
        args = make_fixture(recipient_exists=False, amount=100)["args"]
        result = prepare_transfer(**args)
        self.assertEqual(result["witness"]["firstTokens"], [0, 1])
        self.assertEqual(result["witness"]["newBalances"], [0, 0])
        self.assertEqual(result["witness"]["priorBalanceX"][1], 0)
        self.assertEqual(result["witness"]["priorBalanceY"][1], 1)
        self.assertEqual((result["witness"]["successorBalanceX"][1], result["witness"]["successorBalanceY"][1]), balance_point(100, 41))
        self.assertEqual(len(result["candidate"]["heads"]), 2)
        self.assertEqual(len(result["candidate"]["nullifiers"]), 1)

    def test_recipient_first_token_in_existing_portfolio(self):
        key = hex_field(route_fields(self.args["recipient_route"])[1])
        del self.args["state"]["heads"][key]["portfolio"]["1"]
        refresh_root(self.args)
        result = prepare_transfer(**self.args)
        self.assertEqual(result["witness"]["firstTokens"], [0, 1])
        self.assertEqual(result["witness"]["newBalances"], [70, 0])
        self.assertEqual((result["witness"]["successorBalanceX"][1], result["witness"]["successorBalanceY"][1]), balance_point(30, 41))
        self.assertIn("7", result["candidate"]["heads"][key]["portfolio"])

    def test_approval_changes_cannot_redirect_value(self):
        for field, value in (("amount", 31), ("token_id", 7), ("expires_at_slot", 201),
                             ("valid_after_slot", 11), ("deployment", 1), ("nonce", 790),
                             ("amount_blinding", 457)):
            with self.subTest(field=field):
                args = copy.deepcopy(self.args)
                args[field] = value
                self.assert_rejected_without_mutation(args, "does not bind")
        args = copy.deepcopy(self.args)
        args["recipient_route"]["gpruElgamalKeyCommitment"] = hashlib.sha256(b"different synthetic recipient").hexdigest()
        self.assert_rejected_without_mutation(args, "does not bind")

    def test_attacker_signature_and_signature_mutation_rejected(self):
        attacker = SigningKey(hashlib.sha256(b"SYNTHETIC ATTACKER ONLY").digest())
        self.args["approval"] = sign_approval(self.args, attacker)
        self.assert_rejected_without_mutation(self.args, "registered sender owner")
        self.args["approval"] = copy.deepcopy(self.fixture["args"]["approval"])
        self.args["approval"]["signature"] = "00" * 64
        self.assert_rejected_without_mutation(self.args, "does not bind")

    def test_sender_underflow_rejected(self):
        self.assert_rejected_without_mutation(make_fixture(amount=101)["args"], "underflow or overflow")

    def test_offline_recipient_requires_no_opening_or_plaintext_witness(self):
        self.assertNotIn("recipient_opening", self.args)
        result = prepare_transfer(**self.args)
        for field in ("oldBalances", "oldBlindings", "newBalances", "newBlindings", "blindingCarries"):
            self.assertEqual(result["witness"][field][1], 0)
        before = copy.deepcopy(self.args)
        with self.assertRaisesRegex(TypeError, "recipient_opening"):
            prepare_transfer(**self.args, recipient_opening={"balance": 25, "blinding": 23})
        self.assertEqual(self.args, before)

    def test_accumulated_balances_above_u64_follow_credit_point_semantics(self):
        args = make_fixture(sender_balance=MAX_U64 + 100, recipient_balance=MAX_U64, amount=30)["args"]
        result = prepare_transfer(**args)
        self.assertEqual(result["witness"]["newBalances"], [MAX_U64 + 70, 0])
        self.assertEqual((result["witness"]["successorBalanceX"][1], result["witness"]["successorBalanceY"][1]), balance_point(MAX_U64 + 30, 64))
        with self.assertRaisesRegex(ValueError, "unsigned range"):
            balance_point(MAX_BALANCE + 1, 17)

    def test_wrong_opening_rejected(self):
        self.args["sender_opening"]["blinding"] += 1
        self.assert_rejected_without_mutation(self.args, "differs from the authenticated balance")

    def test_recipient_point_requires_authenticated_current_state(self):
        key = hex_field(route_fields(self.args["recipient_route"])[1])
        point = balance_point(26, 23)
        self.args["state"]["heads"][key]["portfolio"]["1"] = {"x": str(point[0]), "y": str(point[1])}
        self.assert_rejected_without_mutation(self.args, "trusted shared root")

    def test_current_root_and_tip_membership_are_required(self):
        self.args["old_root"] = hex_field(int(self.args["old_root"], 16) + 1)
        self.assert_rejected_without_mutation(self.args, "trusted shared root")
        args = copy.deepcopy(self.fixture["args"])
        args["tip_snapshot"]["leaves"].reverse()
        self.assert_rejected_without_mutation(args, "trusted route root")

    def test_unauthenticated_route_rejected_even_with_owner_signature(self):
        self.args["recipient_route"]["lookupCommitment"] = hashlib.sha256(b"not registered").hexdigest()
        self.args["approval"] = sign_approval(self.args, self.fixture["owner"])
        self.assert_rejected_without_mutation(self.args, "not uniquely authenticated")

    def test_expired_future_and_exhausted_sequences_rejected(self):
        for field, value, reason in (("current_slot", 201, "not currently valid"),
                                     ("current_slot", 9, "not currently valid"),
                                     ("root_sequence", MAX_U64, "sequence is exhausted")):
            with self.subTest(field=field):
                args = copy.deepcopy(self.args)
                args[field] = value
                self.assert_rejected_without_mutation(args, reason)
        key = hex_field(route_fields(self.args["sender_route"])[1])
        self.args["state"]["heads"][key]["sequence"] = str(MAX_U64)
        refresh_root(self.args)
        self.assert_rejected_without_mutation(self.args, "hidden-head sequence is exhausted")

    def test_replay_is_stable_across_reproving(self):
        first = prepare_transfer(**self.args)
        second_args = copy.deepcopy(self.args)
        second_args["blinding_deltas"] = [42, 43]
        second_args["memo_commitments"] = [hex_field(401), hex_field(402)]
        second = prepare_transfer(**second_args)
        self.assertEqual(first["public"]["nullifier"], second["public"]["nullifier"])
        self.assertEqual(first["public"]["authorizationCommitment"], second["public"]["authorizationCommitment"])
        self.assertNotEqual(first["public"]["newGlobalRoot"], second["public"]["newGlobalRoot"])
        self.args["state"] = first["candidate"]
        self.args["old_root"] = hex_field(first["public"]["newGlobalRoot"])
        self.args["root_sequence"] = 13
        self.assert_rejected_without_mutation(self.args, "already spent")

    def test_blinding_carry_and_scalar_aliases(self):
        args = make_fixture(sender_blinding=BABYJUB_SUBORDER - 2, recipient_blinding=BABYJUB_SUBORDER - 3)["args"]
        result = prepare_transfer(**args)
        self.assertEqual(result["witness"]["blindingCarries"], [1, 0])
        self.assertEqual((result["witness"]["successorBalanceX"][1], result["witness"]["successorBalanceY"][1]), balance_point(55, 38))
        for delta in (0, BABYJUB_SUBORDER, BABYJUB_FIELD):
            with self.subTest(delta=delta):
                args = copy.deepcopy(self.args)
                args["blinding_deltas"] = [delta, 41]
                self.assert_rejected_without_mutation(args, "out of range|noncanonical")

    def test_noncanonical_amounts_and_self_transfer_rejected(self):
        for amount in (0, -1, True, "30", 1 << 64):
            with self.subTest(amount=amount):
                args = copy.deepcopy(self.args)
                args["amount"] = amount
                self.assert_rejected_without_mutation(args, "unsigned range")
        self.args["recipient_route"] = copy.deepcopy(self.args["sender_route"])
        self.assert_rejected_without_mutation(self.args, "two distinct hidden-head indices")

    def test_reserve_and_snapshot_failure_are_atomic(self):
        for mutation, reason in (("insolvent", "insolvent"), ("asset", "registered asset"), ("boolean-asset", "registered asset"),
                                 ("duplicate-spend", "duplicate or colliding"), ("missing-memo", "two owner Memo")):
            with self.subTest(mutation=mutation):
                args = copy.deepcopy(self.args)
                if mutation == "insolvent": args["reserve"]["actualAssets"] = 1
                elif mutation == "asset": args["reserve"]["assetId"] = 7
                elif mutation == "boolean-asset": args["reserve"]["assetId"] = True
                elif mutation == "duplicate-spend": args["state"]["nullifiers"] = [hex_field(44), hex_field(44)]
                else: args["memo_commitments"] = [hex_field(301)]
                self.assert_rejected_without_mutation(args, reason)


if __name__ == "__main__":
    unittest.main()
