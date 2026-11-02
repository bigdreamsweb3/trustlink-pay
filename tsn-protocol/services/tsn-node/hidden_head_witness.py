"""Untrusted, root-addressed snapshots for TCAP's hidden authenticated maps.

Snapshots contain commitments and points, never owner balance openings. Only
the root read from TCAP selects a snapshot; saving a candidate advances no state.
"""
from __future__ import annotations

import json
import os
import re
import secrets
from pathlib import Path
from typing import Any

from gpru_crypto import (
    BABYJUB_FIELD, BABYJUB_SUBORDER, BABYJUB_BASE8, _babyjub_add,
    _babyjub_mul, encrypt_balance_blinding_delta_v1, poseidon_v1,
)

BALANCE_H = (
    9398968040714586016327675940839568983565095581299035530848626576251201023018,
    15860466305030097496204584978173195991965382154782248789896917824218270823860,
)


def field(value: Any) -> int:
    if type(value) is int:
        number = value
    elif isinstance(value, str) and re.fullmatch(r"0|[1-9][0-9]*", value):
        number = int(value)
    else:
        raise ValueError("Hidden-head witness fields must be canonical decimal integers")
    if not 0 <= number < BABYJUB_FIELD:
        raise ValueError("Hidden-head witness field is outside BN254")
    return number


def field_hex(value: Any) -> int:
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
        raise ValueError("Hidden-head commitment must be canonical 32-byte hex")
    return field(int(value, 16))


def hex_field(value: int) -> str:
    return field(value).to_bytes(32, "big").hex()


class SparseTree:
    def __init__(self, depth: int, leaves: dict[int, int]):
        self.depth = depth
        self.zeros = [0]
        for _ in range(depth):
            self.zeros.append(poseidon_v1([self.zeros[-1], self.zeros[-1]]))
        if any(type(k) is not int or not 0 <= k < 1 << depth for k in leaves):
            raise ValueError("Hidden-head sparse index is out of range")
        self.levels = [{k: field(v) for k, v in leaves.items() if v}]
        for level in range(depth):
            nodes = self.levels[-1]
            parents = {}
            for parent in {index >> 1 for index in nodes}:
                digest = poseidon_v1([
                    nodes.get(parent * 2, self.zeros[level]),
                    nodes.get(parent * 2 + 1, self.zeros[level]),
                ])
                if digest != self.zeros[level + 1]:
                    parents[parent] = digest
            self.levels.append(parents)
        self.root = self.levels[-1].get(0, self.zeros[-1])

    def siblings(self, index: int) -> list[int]:
        return [self.levels[level].get((index >> level) ^ 1, self.zeros[level]) for level in range(self.depth)]


def path_root(leaf: int, index: int, siblings: list[int]) -> int:
    node = leaf
    for level, sibling in enumerate(siblings):
        node = poseidon_v1([sibling, node] if (index >> level) & 1 else [node, sibling])
    return node


def _point(value: Any) -> tuple[int, int]:
    if not isinstance(value, dict) or set(value) != {"x", "y"}:
        raise ValueError("Hidden-head token point has an unsupported field set")
    x, y = field(value["x"]), field(value["y"])
    if (168700 * x * x + y * y - 1 - 168696 * x * x * y * y) % BABYJUB_FIELD:
        raise ValueError("Hidden-head token point is off the BabyJubjub curve")
    if _babyjub_mul((x, y), BABYJUB_SUBORDER) != (0, 1):
        raise ValueError("Hidden-head token point is outside the prime-order subgroup")
    return x, y


def _portfolio(value: Any) -> SparseTree:
    if not isinstance(value, dict):
        raise ValueError("Hidden-head portfolio must be an object")
    leaves = {}
    for token, point in value.items():
        if not re.fullmatch(r"[1-9][0-9]*", token) or not 0 < int(token) <= 0xFFFFFFFF:
            raise ValueError("Hidden-head portfolio token must be a positive u32")
        x, y = _point(point)
        leaves[int(token)] = poseidon_v1([int(token), x, y])
    return SparseTree(32, leaves)


def _read_snapshot(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise RuntimeError("GPRU_HIDDEN_HEAD_WITNESS_UNAVAILABLE: no snapshot for the chain-selected root")
    if path.stat().st_size > 16 * 1024 * 1024:
        raise ValueError("Hidden-head snapshot exceeds the size limit")
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("Hidden-head snapshot contains duplicate keys")
            result[key] = value
        return result
    value = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique)
    if not isinstance(value, dict) or type(value.get("version")) is not int or value.get("version") != 1:
        raise ValueError("Hidden-head snapshot version is unsupported")
    return value


class HiddenHeadWitnessStore:
    def __init__(self, directory: Path):
        self.directory = directory

    def prepare_credit(self, *, old_root: str, tip_root: str, route: dict[str, Any],
                       token_id: int, amount: int, authorization: str, nullifier: str) -> dict[str, Any]:
        if type(token_id) is not int or not 0 < token_id <= 0xFFFFFFFF or type(amount) is not int or not 0 < amount <= 0xFFFFFFFFFFFFFFFF:
            raise ValueError("Hidden-head credit requires a positive u32 token and u64 amount")
        if field_hex(authorization) == 0:
            raise ValueError("Hidden-head credit authorization must be nonzero")
        # SHA-256 route commitments are reduced exactly as TIP's route_leaf.
        route_key = int(route["gpruElgamalKeyCommitment"], 16) % BABYJUB_FIELD
        route_leaf = poseidon_v1([
            int(route["lookupCommitment"], 16) % BABYJUB_FIELD, route_key,
            int(route["gpruBalanceScanPublicKeyX"], 16),
            int(route["gpruBalanceScanPublicKeyY"], 16),
            int(route["policyCommitment"], 16) % BABYJUB_FIELD,
        ])
        routes = _read_snapshot(self.directory / f"tip-{hex_field(field_hex(tip_root))}.json")
        if set(routes) != {"version", "leaves"} or not isinstance(routes["leaves"], list):
            raise ValueError("TIP route snapshot has an unsupported field set")
        route_leaves = [field(v) for v in routes["leaves"]]
        if route_leaves.count(route_leaf) != 1 or any(v == 0 for v in route_leaves):
            raise ValueError("TIP witness does not contain the uniquely resolved recipient route")
        tip_tree = SparseTree(32, dict(enumerate(route_leaves)))
        if tip_tree.root != field_hex(tip_root):
            raise ValueError("TIP witness does not match the on-chain route root")

        state = _read_snapshot(self.directory / f"tcap-{hex_field(field_hex(old_root))}.json")
        if set(state) != {"version", "heads", "nullifiers"} or not isinstance(state["heads"], dict) or not isinstance(state["nullifiers"], list):
            raise ValueError("TCAP witness snapshot has an unsupported field set")
        head_leaves, indices = {}, set()
        for key, head in state["heads"].items():
            key_value = field_hex(key)
            index = key_value % (1 << 128)
            if index in indices:
                raise ValueError("TCAP witness contains colliding hidden-head indices")
            indices.add(index)
            if not isinstance(head, dict) or set(head) != {"sequence", "memoCommitment", "actionCommitment", "portfolio"}:
                raise ValueError("TCAP predecessor head has an unsupported field set")
            seq = field(head["sequence"])
            if not 0 < seq <= 0xFFFFFFFFFFFFFFFF:
                raise ValueError("TCAP predecessor sequence is not a positive u64")
            memo, action = field_hex(head["memoCommitment"]), field_hex(head["actionCommitment"])
            if memo == 0 or action == 0:
                raise ValueError("TCAP predecessor commitments must be nonzero")
            head_leaves[index] = poseidon_v1([key_value, seq, memo, action, _portfolio(head["portfolio"]).root])
        head_tree = SparseTree(128, head_leaves)
        nullifier_leaves = {}
        for value in state["nullifiers"]:
            n = field_hex(value)
            index = poseidon_v1([n]) % (1 << 128)
            if n == 0 or index in nullifier_leaves:
                raise ValueError("TCAP witness contains duplicate or colliding nullifiers")
            nullifier_leaves[index] = poseidon_v1([n])
        nullifier_tree = SparseTree(128, nullifier_leaves)
        if poseidon_v1([head_tree.root, nullifier_tree.root]) != field_hex(old_root):
            raise ValueError("TCAP witness does not match the on-chain shared root")
        n = field_hex(nullifier)
        nullifier_index = poseidon_v1([n]) % (1 << 128)
        if n == 0 or nullifier_index in nullifier_leaves:
            raise ValueError("TCAP funding nullifier has already been used")
        head_index = route_key % (1 << 128)
        head = state["heads"].get(hex_field(route_key))
        if head is None and head_index in indices:
            raise ValueError("Recipient route collides with an existing TCAP head")
        if head is None:
            head = {"sequence": "0", "memoCommitment": "0" * 64, "actionCommitment": "0" * 64, "portfolio": {}}
        sequence = field(head["sequence"])
        if sequence == 0xFFFFFFFFFFFFFFFF:
            raise ValueError("TCAP hidden-head sequence is exhausted")
        portfolio = _portfolio(head["portfolio"])
        point = head["portfolio"].get(str(token_id))
        predecessor = _point(point) if point is not None else (0, 1)
        delta = secrets.randbelow(BABYJUB_SUBORDER - 1) + 1
        cipher = encrypt_balance_blinding_delta_v1(
            scan_public_key_x=bytes.fromhex(route["gpruBalanceScanPublicKeyX"]),
            scan_public_key_y=bytes.fromhex(route["gpruBalanceScanPublicKeyY"]), blinding_delta=delta,
        )
        successor = _babyjub_add(_babyjub_add(predecessor, _babyjub_mul(BABYJUB_BASE8, amount)), _babyjub_mul(BALANCE_H, delta))
        portfolio_siblings = portfolio.siblings(token_id)
        successor_portfolio = path_root(poseidon_v1([token_id, *successor]), token_id, portfolio_siblings)
        action = poseidon_v1([1, token_id, amount, field_hex(authorization), n])
        witness = {
            "oldGlobalRoot": field_hex(old_root), "tipRouteRoot": field_hex(tip_root),
            "actionCommitment": action, "nullifier": n,
            "successorPortfolioRoot": successor_portfolio,
            "successorBalanceX": successor[0], "successorBalanceY": successor[1],
            "encryptedBlindingDelta": cipher["encryptedDelta"],
            "deltaEphemeralPublicX": cipher["ephemeralPublicX"], "deltaEphemeralPublicY": cipher["ephemeralPublicY"],
            "tipLookupCommitment": int(route["lookupCommitment"], 16) % BABYJUB_FIELD,
            "routeKeyCommitment": route_key, "routePolicyCommitment": int(route["policyCommitment"], 16) % BABYJUB_FIELD,
            "balanceScanPublicX": int(route["gpruBalanceScanPublicKeyX"], 16), "balanceScanPublicY": int(route["gpruBalanceScanPublicKeyY"], 16),
            "tipRouteIndex": route_leaves.index(route_leaf), "tipSiblings": tip_tree.siblings(route_leaves.index(route_leaf)),
            "accountPathKey": route_key, "priorSequence": sequence,
            "predecessorMemoCommitment": field_hex(head["memoCommitment"]), "predecessorActionCommitment": field_hex(head["actionCommitment"]),
            "predecessorPortfolioRoot": portfolio.root, "accountSiblings": head_tree.siblings(head_index),
            "isFirstToken": int(point is None), "predecessorBalanceX": predecessor[0], "predecessorBalanceY": predecessor[1],
            "portfolioSiblings": portfolio_siblings, "nullifierSiblings": nullifier_tree.siblings(nullifier_index),
            "actionKind": 1, "assetId": token_id, "amount": amount, "authorizationCommitment": field_hex(authorization),
            "balanceBlindingDelta": delta, "balanceBlindingCarry": 0, "deltaEphemeralScalar": cipher["ephemeralScalar"],
            "sharedXReduction": cipher["sharedXReduction"], "sharedXCarry": cipher["sharedXCarry"], "encryptedDeltaCarry": cipher["encryptedDeltaCarry"],
            "predecessorBalance": 0, "predecessorBlinding": 0, "successorBalance": 0, "successorBlinding": 0,
        }
        return {"witness": witness, "state": state, "sequence": sequence + 1, "previousMemoCommitment": head["memoCommitment"]}

    def finish_credit(self, prepared: dict[str, Any], memo_field: str) -> None:
        witness = prepared["witness"]
        witness["memoCommitment"] = field_hex(memo_field)
        key = witness["accountPathKey"]
        next_leaf = poseidon_v1([key, witness["priorSequence"] + 1, witness["memoCommitment"], witness["actionCommitment"], witness["successorPortfolioRoot"]])
        next_head_root = path_root(next_leaf, key, witness["accountSiblings"])
        nullifier_key = poseidon_v1([witness["nullifier"]])
        next_nullifier_root = path_root(nullifier_key, nullifier_key, witness["nullifierSiblings"])
        witness["newGlobalRoot"] = poseidon_v1([next_head_root, next_nullifier_root])
        if witness["newGlobalRoot"] == witness["oldGlobalRoot"]:
            raise ValueError("TCAP successor must change the shared root")
        state = prepared["state"]
        prior = state["heads"].get(hex_field(key), {}).get("portfolio", {})
        state["heads"][hex_field(key)] = {
            "sequence": str(witness["priorSequence"] + 1), "memoCommitment": memo_field,
            "actionCommitment": hex_field(witness["actionCommitment"]),
            "portfolio": {**prior, str(witness["assetId"]): {"x": str(witness["successorBalanceX"]), "y": str(witness["successorBalanceY"])}},
        }
        state["nullifiers"].append(hex_field(witness["nullifier"]))

    def save_candidate(self, prepared: dict[str, Any]) -> None:
        # Called only after local proof verification. This immutable candidate
        # becomes usable only if a later chain read selects its exact root.
        target = self.directory / f"tcap-{hex_field(prepared['witness']['newGlobalRoot'])}.json"
        encoded = json.dumps(prepared["state"], sort_keys=True, separators=(",", ":")).encode("utf-8")
        temporary = target.with_suffix(f".{secrets.token_hex(8)}.tmp")
        try:
            with temporary.open("xb") as stream:
                stream.write(encoded)
                stream.flush()
                os.fsync(stream.fileno())
            # Publish without overwriting any existing snapshot. Hard-linking
            # the fully flushed file is atomic, including across Node workers.
            try:
                os.link(temporary, target)
            except FileExistsError:
                if target.read_bytes() != encoded:
                    raise ValueError("A different candidate snapshot already exists for this root")
        finally:
            temporary.unlink(missing_ok=True)
