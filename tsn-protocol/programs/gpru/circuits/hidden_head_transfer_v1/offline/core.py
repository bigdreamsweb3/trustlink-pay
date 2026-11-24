"""Offline paired-transfer witness and owner-approval contract.

The caller supplies trusted, root-selected TIP/TCAP snapshots, the registration
owner commitment and reserve context. This module performs no RPC, persistence,
service operation or transaction signing. Only the sender supplies a private
opening; the recipient receives the existing homomorphic point-credit relation.
"""
from __future__ import annotations

import copy
import hashlib
import re
import secrets
import sys
from pathlib import Path
from typing import Any

from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey

# Reuse the current protocol's native Poseidon, point and tree implementations
# without importing server.py, loading service configuration or composing Node.
NODE_ROOT = Path(__file__).resolve().parents[5] / "services" / "tsn-node"
sys.path.insert(0, str(NODE_ROOT))
from security.cryptography.gpru_contract import BABYJUB_BASE8, BABYJUB_FIELD, BABYJUB_SUBORDER
from security.cryptography._babyjub_add import _babyjub_add
from security.cryptography._babyjub_mul import _babyjub_mul
from security.cryptography.poseidon_v1 import poseidon_v1
from settlement.witness._point import _point
from settlement.witness._portfolio import _portfolio
from settlement.witness.hex_field import hex_field
from settlement.witness.path_root import path_root
from settlement.witness.sparse_tree import SparseTree
from settlement.witness.witness_contract import BALANCE_H

MAX_U64 = (1 << 64) - 1
MAX_BALANCE = (1 << 128) - 1
ACTION_KIND = 4
VALUE_DOMAIN = int.from_bytes(b"TSN_TRANSFER_VALUE_V1", "big")
NULLIFIER_DOMAIN = int.from_bytes(b"TSN_TRANSFER_NULLIFIER_V1", "big")
AUTH_DOMAIN = int.from_bytes(b"TSN_TRANSFER_AUTH_V1", "big")
CONTEXT_DOMAIN = int.from_bytes(b"TSN_TRANSFER_CONTEXT_V1", "big")
SIGNATURE_DOMAIN = b"TSN_TIN_TRANSFER_APPROVAL_V1\0"
PUBLIC_FIELDS = (
    "oldGlobalRoot", "newGlobalRoot", "tipRouteRoot", "rootSequence",
    "deploymentCommitment", "assetId", "validAfterSlot", "expiresAtSlot",
    "amountCommitment", "authorizationCommitment", "actionCommitment", "nullifier",
    "memoCommitments", "successorPortfolioRoots", "successorBalanceX", "successorBalanceY",
)
RESERVE_CATEGORIES = (
    "pendingLiabilities", "settledConfidentialLiabilities",
    "authorizedWithdrawalLiabilities", "reservedRefundLiabilities", "transferPending",
)


def scalar(value: Any, *, nonzero: bool = False) -> int:
    if type(value) is int:
        number = value
    elif isinstance(value, str) and re.fullmatch(r"0|[1-9][0-9]*", value):
        number = int(value)
    else:
        raise ValueError("Transfer scalar encoding is not canonical")
    if not int(nonzero) <= number < BABYJUB_FIELD:
        raise ValueError("Transfer scalar is out of range")
    return number


def hex_scalar(value: Any, *, nonzero: bool = False) -> int:
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
        raise ValueError("Transfer field requires canonical 32-byte lowercase hex")
    return scalar(int(value, 16), nonzero=nonzero)


def uint(value: Any, bits: int, *, positive: bool = False) -> int:
    if type(value) is not int or not int(positive) <= value < 1 << bits:
        raise ValueError("Transfer integer is outside its unsigned range")
    return value


def route_fields(route: dict[str, Any]) -> list[int]:
    required = ("lookupCommitment", "gpruElgamalKeyCommitment",
                "gpruBalanceScanPublicKeyX", "gpruBalanceScanPublicKeyY", "policyCommitment")
    if not isinstance(route, dict) or any(name not in route for name in required):
        raise ValueError("Transfer route is incomplete")
    values = []
    for name in required:
        encoded = route[name]
        if not isinstance(encoded, str) or not re.fullmatch(r"[0-9a-f]{64}", encoded):
            raise ValueError("Transfer route has a malformed commitment")
        number = int(encoded, 16)
        values.append(number % BABYJUB_FIELD if name in required[:2] + required[4:] else scalar(number))
    if values[1] == 0 or values[2] == 0:
        raise ValueError("Transfer route key or scan point is invalid")
    _point({"x": str(values[2]), "y": str(values[3])})
    return values


def balance_point(balance: int, blinding: int) -> tuple[int, int]:
    uint(balance, 128)
    uint(blinding, 252)
    if blinding >= BABYJUB_SUBORDER:
        raise ValueError("Transfer balance blinding is noncanonical")
    return _babyjub_add(_babyjub_mul(BABYJUB_BASE8, balance), _babyjub_mul(BALANCE_H, blinding))


def commitments(*, sender_route: dict[str, Any], recipient_route: dict[str, Any],
                token_id: int, amount: int, nonce: int, amount_blinding: int,
                deployment: int, valid_after_slot: int, expires_at_slot: int) -> dict[str, int]:
    sender, recipient = route_fields(sender_route), route_fields(recipient_route)
    uint(token_id, 32, positive=True)
    uint(amount, 64, positive=True)
    scalar(nonce, nonzero=True)
    scalar(amount_blinding, nonzero=True)
    scalar(deployment, nonzero=True)
    uint(valid_after_slot, 64)
    uint(expires_at_slot, 64)
    if expires_at_slot < valid_after_slot:
        raise ValueError("Transfer authorization interval is reversed")
    if sender[1] % (1 << 128) == recipient[1] % (1 << 128):
        raise ValueError("Transfer requires two distinct hidden-head indices")
    nullifier = poseidon_v1([NULLIFIER_DOMAIN, sender[1], nonce])
    value = poseidon_v1([VALUE_DOMAIN, token_id, amount, amount_blinding, nullifier])
    context = poseidon_v1([CONTEXT_DOMAIN, deployment, token_id, valid_after_slot, expires_at_slot])
    approval = poseidon_v1([AUTH_DOMAIN, sender[1], recipient[1], value, poseidon_v1([context, nonce])])
    action = poseidon_v1([ACTION_KIND, token_id, value, approval, nullifier])
    if any(number == 0 for number in (nullifier, value, approval, action)):
        raise ValueError("Transfer commitment is zero")
    return {"nullifier": nullifier, "amountCommitment": value,
            "authorizationCommitment": approval, "actionCommitment": action}


def approval_message(authorization_commitment: int) -> bytes:
    return SIGNATURE_DOMAIN + scalar(authorization_commitment, nonzero=True).to_bytes(32, "big")


def verify_approval(approval: dict[str, str], owner_commitment: str, commitment: int) -> None:
    if not isinstance(approval, dict) or set(approval) != {"ownerPublicKey", "signature"}:
        raise ValueError("Transfer approval has an unsupported field set")
    public = approval["ownerPublicKey"]
    signature = approval["signature"]
    if (not isinstance(public, str) or not re.fullmatch(r"[0-9a-f]{64}", public)
            or not isinstance(signature, str) or not re.fullmatch(r"[0-9a-f]{128}", signature)
            or not isinstance(owner_commitment, str) or not re.fullmatch(r"[0-9a-f]{64}", owner_commitment)):
        raise ValueError("Transfer approval has a malformed owner or signature")
    owner = bytes.fromhex(public)
    # This pin must come from the independently validated sender TIP registry,
    # never from the submitted approval. TIP's current hash is unsalted SHA-256.
    if hashlib.sha256(owner).hexdigest() != owner_commitment:
        raise ValueError("Transfer approval is not from the registered sender owner")
    try:
        VerifyKey(owner).verify(approval_message(commitment), bytes.fromhex(signature))
    except (BadSignatureError, ValueError) as error:
        raise ValueError("Transfer owner approval does not bind this intent") from error


def state_trees(state: dict[str, Any]) -> tuple[SparseTree, SparseTree, dict[int, int]]:
    if (not isinstance(state, dict) or set(state) != {"version", "heads", "nullifiers"}
            or type(state["version"]) is not int or state["version"] != 1
            or not isinstance(state["heads"], dict) or not isinstance(state["nullifiers"], list)):
        raise ValueError("Transfer TCAP snapshot has an unsupported layout")
    leaves: dict[int, int] = {}
    for key, head in state["heads"].items():
        route = hex_scalar(key, nonzero=True)
        index = route % (1 << 128)
        if index in leaves:
            raise ValueError("Transfer snapshot has colliding head indices")
        if not isinstance(head, dict) or set(head) != {"sequence", "memoCommitment", "actionCommitment", "portfolio"}:
            raise ValueError("Transfer predecessor has an unsupported layout")
        sequence = scalar(head["sequence"], nonzero=True)
        uint(sequence, 64, positive=True)
        leaves[index] = poseidon_v1([route, sequence, hex_scalar(head["memoCommitment"], nonzero=True),
                                   hex_scalar(head["actionCommitment"], nonzero=True), _portfolio(head["portfolio"]).root])
    spent: dict[int, int] = {}
    for value in state["nullifiers"]:
        nullifier = hex_scalar(value, nonzero=True)
        key = poseidon_v1([nullifier])
        index = key % (1 << 128)
        if index in spent:
            raise ValueError("Transfer snapshot has duplicate or colliding nullifiers")
        spent[index] = key
    return SparseTree(128, leaves), SparseTree(128, spent), leaves


def prepare_transfer(*, state: dict[str, Any], tip_snapshot: dict[str, Any], old_root: str,
                     tip_root: str, root_sequence: int, sender_route: dict[str, Any],
                     recipient_route: dict[str, Any], sender_opening: dict[str, int],
                     token_id: int, amount: int, nonce: int,
                     amount_blinding: int, deployment: int, valid_after_slot: int,
                     expires_at_slot: int, current_slot: int, approval: dict[str, str],
                     sender_owner_commitment: str, memo_commitments: list[str],
                     reserve: dict[str, int], blinding_deltas: list[int] | None = None) -> dict[str, Any]:
    """Prepare both legs without changing any supplied state or writing files.

    Ed25519 approval, slot validity and reserve solvency are host preconditions;
    the circuit authenticates both routes, the sender opening, matched debit and
    recipient point increment, and replay. Recipient balances remain unopened.
    A candidate is not accepted state until its exact proof and current root,
    sequence, slot and reserve context have been checked by the future executor.
    """
    bound = commitments(sender_route=sender_route, recipient_route=recipient_route, token_id=token_id,
                        amount=amount, nonce=nonce, amount_blinding=amount_blinding, deployment=deployment,
                        valid_after_slot=valid_after_slot, expires_at_slot=expires_at_slot)
    verify_approval(approval, sender_owner_commitment, bound["authorizationCommitment"])
    uint(current_slot, 64)
    uint(root_sequence, 64)
    if root_sequence == MAX_U64:
        raise ValueError("Transfer shared-root sequence is exhausted")
    if not valid_after_slot <= current_slot <= expires_at_slot:
        raise ValueError("Transfer authorization is not currently valid")
    if (not isinstance(reserve, dict)
            or set(reserve) != {"assetId", "actualAssets", *RESERVE_CATEGORIES}
            or type(reserve["assetId"]) is not int or reserve["assetId"] != token_id):
        raise ValueError("Transfer reserve does not bind the registered asset")
    for category in ("actualAssets", *RESERVE_CATEGORIES):
        uint(reserve[category], 64)
    total = sum(reserve[category] for category in RESERVE_CATEGORIES)
    if total > MAX_U64 or reserve["actualAssets"] < total:
        raise ValueError("Transfer reserve is insolvent or its liabilities overflow")
    if not isinstance(memo_commitments, list) or len(memo_commitments) != 2:
        raise ValueError("Transfer requires two owner Memo commitments")
    memos = [hex_scalar(value, nonzero=True) for value in memo_commitments]
    routes = [route_fields(sender_route), route_fields(recipient_route)]
    if (not isinstance(tip_snapshot, dict) or set(tip_snapshot) != {"version", "leaves"}
            or type(tip_snapshot["version"]) is not int or tip_snapshot["version"] != 1
            or not isinstance(tip_snapshot["leaves"], list)):
        raise ValueError("Transfer TIP snapshot has an unsupported layout")
    route_leaves = [scalar(value, nonzero=True) for value in tip_snapshot["leaves"]]
    if len(route_leaves) > 10000:
        raise ValueError("Transfer TIP snapshot exceeds the current reconstruction bound")
    tip_tree = SparseTree(32, dict(enumerate(route_leaves)))
    if tip_tree.root != hex_scalar(tip_root, nonzero=True):
        raise ValueError("Transfer TIP snapshot differs from the trusted route root")
    route_indices = []
    for route in routes:
        leaf = poseidon_v1(route)
        if route_leaves.count(leaf) != 1:
            raise ValueError("Transfer route is not uniquely authenticated by TIP")
        route_indices.append(route_leaves.index(leaf))
    head_tree, spend_tree, head_leaves = state_trees(state)
    if poseidon_v1([head_tree.root, spend_tree.root]) != hex_scalar(old_root, nonzero=True):
        raise ValueError("Transfer TCAP snapshot differs from the trusted shared root")
    spend_key = poseidon_v1([bound["nullifier"]])
    spend_index = spend_key % (1 << 128)
    if spend_index in spend_tree.levels[0]:
        raise ValueError("Transfer authorization nullifier is already spent")

    deltas = blinding_deltas if blinding_deltas is not None else [secrets.randbelow(BABYJUB_SUBORDER - 1) + 1 for _ in range(2)]
    if not isinstance(deltas, list) or len(deltas) != 2:
        raise ValueError("Transfer requires two independent blinding deltas")
    candidate = copy.deepcopy(state)
    witness: dict[str, Any] = {
        "oldGlobalRoot": hex_scalar(old_root), "tipRouteRoot": hex_scalar(tip_root),
        "rootSequence": root_sequence, "deploymentCommitment": deployment,
        "assetId": token_id, "validAfterSlot": valid_after_slot, "expiresAtSlot": expires_at_slot,
        **bound, "amount": amount, "amountBlinding": amount_blinding, "nonce": nonce,
        "memoCommitments": memos, "nullifierSiblings": spend_tree.siblings(spend_index),
    }
    vectors = ("lookup", "routeKeys", "policies", "scanX", "scanY", "routeIndices", "routeSiblings",
               "sequences", "priorMemos", "priorActions", "priorPortfolios", "firstTokens",
               "portfolioSiblings", "priorBalanceX", "priorBalanceY", "oldBalances", "oldBlindings", "newBalances", "newBlindings",
               "blindingDeltas", "blindingCarries", "accountSiblings", "successorPortfolioRoots",
               "successorBalanceX", "successorBalanceY")
    witness.update({name: [] for name in vectors})
    for side in range(2):
        route = routes[side]
        key = hex_field(route[1])
        index = route[1] % (1 << 128)
        head = state["heads"].get(key)
        if head is None and index in head_leaves:
            raise ValueError("Transfer route collides with an existing hidden head")
        if side == 0 and (head is None or str(token_id) not in head["portfolio"]):
            raise ValueError("Transfer sender has no authenticated asset balance")
        if head is None:
            head = {"sequence": "0", "memoCommitment": "0" * 64, "actionCommitment": "0" * 64, "portfolio": {}}
        sequence = scalar(head["sequence"])
        if sequence == MAX_U64:
            raise ValueError("Transfer hidden-head sequence is exhausted")
        first = int(str(token_id) not in head["portfolio"])
        prior = (0, 1) if first else _point(head["portfolio"][str(token_id)])
        delta = scalar(deltas[side], nonzero=True)
        if delta >= BABYJUB_SUBORDER:
            raise ValueError("Transfer blinding delta is noncanonical")
        if side == 0:
            if not isinstance(sender_opening, dict) or set(sender_opening) != {"balance", "blinding"}:
                raise ValueError("Transfer requires an exact private sender balance opening")
            if balance_point(sender_opening["balance"], sender_opening["blinding"]) != prior:
                raise ValueError("Transfer private opening differs from the authenticated balance")
            old_balance, old_blind = sender_opening["balance"], sender_opening["blinding"]
            next_balance = old_balance - amount
            if not 0 <= next_balance <= MAX_BALANCE:
                raise ValueError("Transfer sender balance would underflow or overflow")
            next_blind = (old_blind + delta) % BABYJUB_SUBORDER
            carry = (old_blind + delta) // BABYJUB_SUBORDER
            point = balance_point(next_balance, next_blind)
        else:
            # These placeholders convey no recipient opening. Like deposit
            # credit, the authenticated point is sufficient to add the amount.
            old_balance = old_blind = next_balance = next_blind = carry = 0
            amount_point = _babyjub_mul(BABYJUB_BASE8, amount)
            delta_point = _babyjub_mul(BALANCE_H, delta)
            point = _babyjub_add(_babyjub_add(prior, amount_point), delta_point)
        portfolio = _portfolio(head["portfolio"])
        portfolio_siblings = portfolio.siblings(token_id)
        next_portfolio = path_root(poseidon_v1([token_id, *point]), token_id, portfolio_siblings)
        entries = {
            "lookup": route[0], "routeKeys": route[1], "policies": route[4], "scanX": route[2], "scanY": route[3],
            "routeIndices": route_indices[side], "routeSiblings": tip_tree.siblings(route_indices[side]),
            "sequences": sequence, "priorMemos": hex_scalar(head["memoCommitment"]),
            "priorActions": hex_scalar(head["actionCommitment"]), "priorPortfolios": portfolio.root,
            "firstTokens": first, "portfolioSiblings": portfolio_siblings,
            "priorBalanceX": prior[0], "priorBalanceY": prior[1],
            "oldBalances": old_balance, "oldBlindings": old_blind,
            "newBalances": next_balance, "newBlindings": next_blind, "blindingDeltas": delta,
            "blindingCarries": carry,
            "accountSiblings": head_tree.siblings(index), "successorPortfolioRoots": next_portfolio,
            "successorBalanceX": point[0], "successorBalanceY": point[1],
        }
        for name, value in entries.items():
            witness[name].append(value)
        candidate["heads"][key] = {
            "sequence": str(sequence + 1), "memoCommitment": memo_commitments[side],
            "actionCommitment": hex_field(bound["actionCommitment"]),
            "portfolio": {**head["portfolio"], str(token_id): {"x": str(point[0]), "y": str(point[1])}},
        }
        head_leaves[index] = poseidon_v1([route[1], sequence + 1, memos[side], bound["actionCommitment"], next_portfolio])
        # The recipient proof must use this intermediate map, not two unrelated
        # proofs against the original head tree.
        head_tree = SparseTree(128, head_leaves)
    new_spent = dict(spend_tree.levels[0])
    new_spent[spend_index] = spend_key
    witness["newGlobalRoot"] = poseidon_v1([head_tree.root, SparseTree(128, new_spent).root])
    if witness["newGlobalRoot"] == witness["oldGlobalRoot"]:
        raise ValueError("Transfer must change the shared state root")
    candidate["nullifiers"].append(hex_field(bound["nullifier"]))
    public = copy.deepcopy({name: witness[name] for name in PUBLIC_FIELDS})
    return {"witness": witness, "public": public, "candidate": candidate,
            "nextRootSequence": root_sequence + 1,
            "accounting": {"actionKind": ACTION_KIND, "entryCount": 1, "assetId": token_id,
                           "actualAssetsDelta": 0, **{name + "Delta": 0 for name in RESERVE_CATEGORIES}},
            "reserve": copy.deepcopy(reserve)}
