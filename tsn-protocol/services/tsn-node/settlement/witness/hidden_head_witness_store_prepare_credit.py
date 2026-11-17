"""HiddenHeadWitnessStore.prepare_credit implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from security.cryptography.gpru_contract import BABYJUB_BASE8
from security.cryptography.gpru_contract import BABYJUB_FIELD
from security.cryptography.gpru_contract import BABYJUB_SUBORDER
from settlement.witness.witness_contract import BALANCE_H
from settlement.witness.sparse_tree import SparseTree
from security.cryptography._babyjub_add import _babyjub_add
from security.cryptography._babyjub_mul import _babyjub_mul
from settlement.witness._point import _point
from settlement.witness._portfolio import _portfolio
from settlement.witness._read_snapshot import _read_snapshot
from security.cryptography.encrypt_balance_blinding_delta_v1 import encrypt_balance_blinding_delta_v1
from settlement.witness.field import field
from settlement.witness.field_hex import field_hex
from settlement.witness.hex_field import hex_field
from settlement.witness.path_root import path_root
from security.cryptography.poseidon_v1 import poseidon_v1
import secrets

def prepare_credit(self, *, old_root: str, tip_root: str, route: dict[str, Any],
                   token_id: int, amount: int, authorization: str, nullifier: str,
                   funding_note: dict[str, Any], funding_membership: dict[str, Any], amount_blinding: int | None = None) -> dict[str, Any]:
    from settlement.funding.validate_funding_note import validate_funding_note
    from settlement.funding.funded_leaf import funded_leaf
    from settlement.funding.funding_nullifier import funding_nullifier
    note = validate_funding_note(funding_note)
    if funding_nullifier(note) != nullifier:
        raise ValueError("Credit nullifier differs from the private funding opening")
    if (not isinstance(funding_membership, dict)
            or set(funding_membership) != {"fundingRoot", "fundingIndex", "fundingSiblings"}):
        raise ValueError("Funding membership has an unsupported field set")
    funding_root = field(funding_membership["fundingRoot"])
    funding_index = funding_membership["fundingIndex"]
    funding_siblings = funding_membership["fundingSiblings"]
    if (type(funding_index) is not int or not 0 <= funding_index < 1 << 32
            or not isinstance(funding_siblings, list) or len(funding_siblings) != 32):
        raise ValueError("Funding membership index or path is invalid")
    funding_siblings = [field(v) for v in funding_siblings]
    if path_root(funded_leaf(note["commitment"], token_id, amount), funding_index, funding_siblings) != funding_root:
        raise ValueError("Funding opening, registered token or amount differs from funded membership")
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
    from amounts.credit.commitment import commitment
    amount_blinding = secrets.randbelow(BABYJUB_FIELD-1)+1 if amount_blinding is None else amount_blinding
    value_commitment = commitment(token_id,amount,amount_blinding,n)
    action = poseidon_v1([1, token_id, value_commitment, field_hex(authorization), n])
    witness = {
        "oldGlobalRoot": field_hex(old_root), "tipRouteRoot": field_hex(tip_root),
        "fundingRoot": funding_root, "fundingIndex": funding_index, "fundingSiblings": funding_siblings,
        "fundingSecret": field_hex(note["secret"]), "fundingBlinding": field_hex(note["blinding"]),
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
        "amountBlinding": amount_blinding, "amountCommitment": value_commitment,
        "actionKind": 1, "assetId": token_id, "amount": amount, "authorizationCommitment": field_hex(authorization),
        "balanceBlindingDelta": delta, "balanceBlindingCarry": 0, "deltaEphemeralScalar": cipher["ephemeralScalar"],
        "sharedXReduction": cipher["sharedXReduction"], "sharedXCarry": cipher["sharedXCarry"], "encryptedDeltaCarry": cipher["encryptedDeltaCarry"],
        "predecessorBalance": 0, "predecessorBlinding": 0, "successorBalance": 0, "successorBlinding": 0,
    }
    return {"witness": witness, "state": state, "sequence": sequence + 1, "previousMemoCommitment": head["memoCommitment"]}
