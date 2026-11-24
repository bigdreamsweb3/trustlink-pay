"""Synthetic offline fixtures; no real identity, wallet, funding or RPC data."""
from __future__ import annotations
import copy
import hashlib
from nacl.signing import SigningKey
from core import (
    BABYJUB_BASE8, BABYJUB_FIELD, BABYJUB_SUBORDER, RESERVE_CATEGORIES,
    SparseTree, _babyjub_mul, approval_message, balance_point, commitments,
    hex_field, poseidon_v1, prepare_tin_debit, route_fields, state_trees, _portfolio,
)


def make_fixture(*, recipient_exists: bool = True, sender_balance: int = 100,
                 recipient_balance: int = 25, sender_blinding: int = 17,
                 recipient_blinding: int = 23, amount: int = 30) -> dict:
    routes = []
    for label, scan_secret in (("synthetic-sender", 3), ("synthetic-recipient", 5)):
        scan = _babyjub_mul(BABYJUB_BASE8, scan_secret)
        routes.append({
            "lookupCommitment": hashlib.sha256((label + "-lookup").encode()).hexdigest(),
            "gpruElgamalKeyCommitment": hashlib.sha256((label + "-route").encode()).hexdigest(),
            "gpruBalanceScanPublicKeyX": hex_field(scan[0]),
            "gpruBalanceScanPublicKeyY": hex_field(scan[1]),
            "policyCommitment": hashlib.sha256((label + "-policy").encode()).hexdigest(),
        })
    leaves = [poseidon_v1(route_fields(route)) for route in routes]
    tip = {"version": 1, "leaves": [str(leaf) for leaf in leaves]}
    state = {"version": 1, "heads": {}, "nullifiers": []}
    openings = [{"balance": sender_balance, "blinding": sender_blinding},
                {"balance": recipient_balance, "blinding": recipient_blinding} if recipient_exists else {"balance": 0, "blinding": 0}]
    for side, route in enumerate(routes):
        if side and not recipient_exists:
            continue
        point = balance_point(**openings[side])
        other = balance_point(9 + side, 31 + side)
        state["heads"][hex_field(route_fields(route)[1])] = {
            "sequence": str(2 + side), "memoCommitment": hex_field(101 + side),
            "actionCommitment": hex_field(201 + side),
            "portfolio": {"1": {"x": str(point[0]), "y": str(point[1])},
                          "7": {"x": str(other[0]), "y": str(other[1])}},
        }
    head, spent, _ = state_trees(state)
    reserve = {"assetId": 1, "actualAssets": 1000, **{name: 0 for name in RESERVE_CATEGORIES}}
    reserve["settledConfidentialLiabilities"] = 500
    args = {
        "state": state, "tip_snapshot": tip, "old_root": hex_field(poseidon_v1([head.root, spent.root])),
        "tip_root": hex_field(SparseTree(32, dict(enumerate(leaves))).root), "root_sequence": 12,
        "sender_route": routes[0], "recipient_route": routes[1],
        "sender_opening": openings[0],
        "token_id": 1, "amount": amount, "nonce": 789, "amount_blinding": 456,
        "deployment": int.from_bytes(hashlib.sha256(b"synthetic-deployment").digest(), "big") % BABYJUB_FIELD,
        "valid_after_slot": 10, "expires_at_slot": 200, "current_slot": 50,
        "memo_commitments": [hex_field(301), hex_field(302)], "reserve": reserve,
        "blinding_deltas": [37, 41],
    }
    owner = SigningKey(hashlib.sha256(b"SYNTHETIC TEST OWNER ONLY").digest())
    args["sender_owner_commitment"] = hashlib.sha256(bytes(owner.verify_key)).hexdigest()
    args["approval"] = sign_approval(args, owner)
    return {"args": args, "owner": owner}


def sign_approval(args: dict, owner: SigningKey) -> dict[str, str]:
    fields = commitments(**{name: args[name] for name in (
        "sender_route", "recipient_route", "token_id", "amount", "nonce", "amount_blinding",
        "deployment", "valid_after_slot", "expires_at_slot")})
    signed = owner.sign(approval_message(fields["authorizationCommitment"]))
    return {"ownerPublicKey": bytes(owner.verify_key).hex(), "signature": signed.signature.hex()}


def refresh_root(args: dict) -> None:
    heads, spent, _ = state_trees(args["state"])
    args["old_root"] = hex_field(poseidon_v1([heads.root, spent.root]))


def prepared_fixture(**options) -> dict:
    return prepare_tin_debit(**make_fixture(**options)["args"])


def circuit_cases() -> dict:
    existing = prepared_fixture()
    fresh = prepared_fixture(recipient_exists=False)
    full = prepared_fixture(amount=100)
    carry = prepared_fixture(sender_blinding=BABYJUB_SUBORDER - 2, recipient_blinding=BABYJUB_SUBORDER - 3)
    large_sender = prepared_fixture(sender_balance=(1 << 64) + 100)
    large_recipient = prepared_fixture(recipient_balance=(1 << 64) + 25)
    positive = {"existing-recipient": existing["witness"], "first-recipient": fresh["witness"],
                "full-spend": full["witness"], "blinding-carry": carry["witness"],
                "large-sender-balance": large_sender["witness"], "large-recipient-point": large_recipient["witness"]}
    # Every mutation preserves the original public roots unless the named
    # statement input itself is being attacked. The compiler must reject it.
    attacks = (
        ("underflow", "oldBalances", [20, 0]),
        ("recipient-opening-placeholder", "oldBalances", [100, 25]),
        ("recipient-successor-placeholder", "newBalances", [70, 55]),
        ("recipient-blinding-placeholder", "oldBlindings", [17, 23]),
        ("recipient-new-blinding-placeholder", "newBlindings", [54, 64]),
        ("recipient-carry-placeholder", "blindingCarries", [0, 1]),
        ("missing-sender-debit", "newBalances", [100, 0]),
        ("wrong-sender-opening", "oldBlindings", [18, 0]),
        ("wrong-recipient-point", "priorBalanceX", [existing["witness"]["priorBalanceX"][0], existing["witness"]["priorBalanceX"][1] + 1]),
        ("wrong-asset", "assetId", 7),
        ("changed-amount", "amount", 31),
        ("changed-nonce", "nonce", 790),
        ("wrong-authorization", "authorizationCommitment", existing["witness"]["authorizationCommitment"] + 1),
        ("changed-expiry", "expiresAtSlot", 201),
        ("wrong-deployment", "deploymentCommitment", 1),
        ("wrong-memo", "memoCommitments", [303, 302]),
        ("zero-amount", "amount", 0),
        ("zero-amount-blinding", "amountBlinding", 0),
        ("zero-nonce", "nonce", 0),
        ("zero-delta", "blindingDeltas", [0, 41]),
        ("noncanonical-blinding", "oldBlindings", [BABYJUB_SUBORDER, 0]),
        ("sender-balance-over-u128", "oldBalances", [1 << 128, 0]),
        ("exhausted-head", "sequences", [(1 << 64) - 1, 3]),
        ("exhausted-root", "rootSequence", (1 << 64) - 1),
        ("stale-root", "oldGlobalRoot", existing["witness"]["oldGlobalRoot"] + 1),
        ("native-tin-debit-root", "newGlobalRoot", existing["witness"]["oldGlobalRoot"]),
        ("wrong-route-root", "tipRouteRoot", existing["witness"]["tipRouteRoot"] + 1),
        ("wrong-nullifier", "nullifier", existing["witness"]["nullifier"] + 1),
        ("wrong-successor-point", "successorBalanceX", [existing["witness"]["successorBalanceX"][0] + 1, existing["witness"]["successorBalanceX"][1]]),
    )
    negative = {}
    for label, field, value in attacks:
        witness = copy.deepcopy(existing["witness"])
        witness[field] = value
        negative[label] = witness
    # Recompute the entire successor portfolio/global root around a forged
    # recipient value. Authenticated root bookkeeping alone must not make an
    # unequal credit pass the amount-linked point-addition constraint.
    for label, balance in (("invented-recipient-extra-credit", 56), ("recipient-credit-less-than-debit", 54)):
        forged = copy.deepcopy(existing["witness"])
        candidate = copy.deepcopy(existing["candidate"])
        expected = balance_point(balance, 64)
        key = hex_field(forged["routeKeys"][1])
        portfolio = candidate["heads"][key]["portfolio"]
        portfolio["1"] = {"x": str(expected[0]), "y": str(expected[1])}
        forged["successorBalanceX"][1], forged["successorBalanceY"][1] = expected
        forged["successorPortfolioRoots"][1] = _portfolio(portfolio).root
        heads, spent, _ = state_trees(candidate)
        forged["newGlobalRoot"] = poseidon_v1([heads.root, spent.root])
        negative[label] = forged
    for field in ("encryptedBlindingDeltas", "deltaEphemeralPublicX", "deltaEphemeralPublicY", "deltaEphemeralScalars",
                  "sharedXReductions", "sharedXCarries", "encryptedDeltaCarries"):
        for leg in (0, 1):
            altered = copy.deepcopy(existing["witness"])
            altered[field][leg] += 1
            negative[f"cipher-{field}-{leg}"] = altered
    independent = copy.deepcopy(existing["witness"])
    original_heads, _, _ = state_trees(make_fixture()["args"]["state"])
    independent["accountSiblings"][1] = original_heads.siblings(independent["routeKeys"][1] % (1 << 128))
    negative["independent-recipient-path"] = independent
    bad_tip = copy.deepcopy(existing["witness"])
    bad_tip["routeSiblings"][1][0] += 1
    negative["wrong-recipient-membership"] = bad_tip
    replay = copy.deepcopy(existing["witness"])
    replay["oldGlobalRoot"] = existing["witness"]["newGlobalRoot"]
    negative["replay-against-successor"] = replay
    alias = copy.deepcopy(existing["witness"])
    alias["routeKeys"][1] = alias["routeKeys"][0] + (1 << 128)
    negative["colliding-low-bit-indices"] = alias
    return {"positive": positive, "negative": negative}
