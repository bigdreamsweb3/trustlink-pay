"""Synthetic cross-language test bridge; bounded stdin and sanitized failures.

Private fixture data stays on subprocess pipes. This is not an HTTP handler or
a persistence/import interface for real owner credentials.
"""
from __future__ import annotations

import hashlib
import json
import sys

from core import (
    BABYJUB_FIELD, PUBLIC_FIELDS, RESERVE_CATEGORIES, SparseTree, BABYJUB_BASE8, BABYJUB_SUBORDER, BALANCE_H, _babyjub_add, _babyjub_mul,
    hex_field, poseidon_v1, route_fields, state_trees,
)
from sender import _route_record_key, prepare_sender_tin_debit
from security.cryptography.derive_node_record_shared_point import derive_node_record_shared_point
from security.cryptography.encrypt_balance_blinding_delta_v1 import encrypt_balance_blinding_delta_v1
from transactions.records.encrypt_transaction_record_v1 import encrypt_transaction_record_v1
from amounts.credit.commitment import commitment as credit_amount_commitment


def wire(value):
    if type(value) is int:
        return str(value)
    if isinstance(value, dict):
        return {name: wire(item) for name, item in value.items()}
    if isinstance(value, list):
        return [wire(item) for item in value]
    return value


def bootstrap(request):
    routes = []
    for leg, keys in enumerate(request["keys"]):
        route = {
            "lookupCommitment": hashlib.sha256(f"synthetic-owner-{leg}-lookup".encode()).hexdigest(),
            "policyCommitment": hashlib.sha256(f"synthetic-owner-{leg}-policy".encode()).hexdigest(),
            **keys,
        }
        _route_record_key(route)
        route_fields(route)
        routes.append(route)
    if len(routes) != 2:
        raise ValueError()
    options = request.get("options", {})
    balances = [int(options.get("senderBalance", "100")), int(options.get("recipientBalance", "25"))]
    blindings = [int(options.get("senderBlinding", "17")), int(options.get("recipientBlinding", "23"))]
    amount = int(options.get("amount", "30"))
    fresh = options.get("freshRecipient", False)
    state = {"version": 1, "heads": {}, "nullifiers": []}
    memos, actions = [], []
    for leg, route in enumerate(routes):
        if leg and fresh:
            balances[leg] = blindings[leg] = 0
            memos.append(None)
            actions.append(None)
            continue
        if not 0 < balances[leg] <= 2 * ((1 << 64) - 1):
            raise ValueError("Synthetic bootstrap supports one or two u64 credits")
        chunks = [min(balances[leg], (1 << 64) - 1)]
        if balances[leg] > (1 << 64) - 1:
            chunks.append(balances[leg] - chunks[0])
        prior_point = (0, 1)
        previous_memo = "0" * 64
        owner_memos, owner_actions = [], []
        for step, credit_amount in enumerate(chunks):
            sequence = step + 1
            delta = blindings[leg] if len(chunks) == 1 else (blindings[leg] - 1) % BABYJUB_SUBORDER if step == 0 else 1
            if delta == 0:
                raise ValueError("Synthetic initial credit blinding must be nonzero")
            point = _babyjub_add(_babyjub_add(prior_point, _babyjub_mul(BABYJUB_BASE8, credit_amount)), _babyjub_mul(BALANCE_H, delta))
            portfolio = SparseTree(32, {1: poseidon_v1([1, *point])}).root
            authorization, nullifier, amount_blinding = 700 + leg * 10 + step, 800 + leg * 10 + step, 900 + leg * 10 + step
            value = credit_amount_commitment(1, credit_amount, amount_blinding, nullifier)
            action = poseidon_v1([1, 1, value, authorization, nullifier])
            record = {
                "version": 2, "recordType": "tsn-gpru-balance-action-v2", "actionKind": 1,
                "sequence": str(sequence), "previousMemoCommitment": previous_memo,
                "actionCommitment": hex_field(action), "authorizationCommitment": hex_field(authorization),
                "nullifier": hex_field(nullifier), "tokenId": 1, "amountBaseUnits": str(credit_amount),
                "amountCommitment": hex_field(value), "amountBlinding": hex_field(amount_blinding),
            }
            ephemeral, shared = derive_node_record_shared_point(_route_record_key(route))
            cipher = encrypt_balance_blinding_delta_v1(
                scan_public_key_x=bytes.fromhex(route["gpruBalanceScanPublicKeyX"]),
                scan_public_key_y=bytes.fromhex(route["gpruBalanceScanPublicKeyY"]), blinding_delta=delta,
            )
            memo = encrypt_transaction_record_v1(
                record=record, shared_point=shared, record_ephemeral_public_key=ephemeral,
                dna=hashlib.sha256(f"synthetic-bootstrap-dna-{leg}-{step}".encode()).digest(),
                encrypted_blinding_delta=hex_field(cipher["encryptedDelta"]),
                delta_ephemeral_public_x=hex_field(cipher["ephemeralPublicX"]),
                delta_ephemeral_public_y=hex_field(cipher["ephemeralPublicY"]),
                memo_binding={"successorPortfolioRoot": hex_field(portfolio), "successorBalanceX": hex_field(point[0]),
                              "successorBalanceY": hex_field(point[1]), "actionCommitment": hex_field(action),
                              "authorizationCommitment": hex_field(authorization), "nullifier": hex_field(nullifier)},
            )
            state["heads"][hex_field(route_fields(route)[1])] = {
                "sequence": str(sequence), "memoCommitment": memo["memoCommitmentField"], "actionCommitment": hex_field(action),
                "portfolio": {"1": {"x": str(point[0]), "y": str(point[1])}},
            }
            owner_memos.append(memo["memoPayload"])
            owner_actions.append({name: record[name] for name in (
                "actionKind", "tokenId", "amountCommitment", "actionCommitment", "authorizationCommitment", "nullifier")})
            prior_point, previous_memo = point, memo["memoCommitmentField"]
        memos.append(owner_memos)
        actions.append(owner_actions)
    leaves = [poseidon_v1(route_fields(route)) for route in routes]
    head, spent, _ = state_trees(state)
    sender_pin = hashlib.sha256(bytes.fromhex(request["senderOwner"])).hexdigest()
    args = {
        "state": state, "tip_snapshot": {"version": 1, "leaves": [str(leaf) for leaf in leaves]},
        "old_root": hex_field(poseidon_v1([head.root, spent.root])),
        "tip_root": hex_field(SparseTree(32, dict(enumerate(leaves))).root), "root_sequence": "12",
        "sender_route": routes[0], "recipient_route": routes[1], "token_id": "1", "amount": str(amount),
        "nonce": "789", "amount_blinding": "456", "deployment": str(int.from_bytes(hashlib.sha256(b"synthetic-owner-transfer-deployment").digest(), "big") % BABYJUB_FIELD),
        "valid_after_slot": "10", "expires_at_slot": "200", "current_slot": "50",
        "sender_owner_commitment": sender_pin,
        "reserve": {"assetId": 1, "actualAssets": 1000, **{name: 0 for name in RESERVE_CATEGORIES}},
    }
    args["reserve"]["settledConfidentialLiabilities"] = 500
    if "blindingDeltas" in options:
        args["blinding_deltas"] = options["blindingDeltas"]
    return {"args": args, "initialMemos": memos, "initialActions": actions}


def prepare(request):
    args = request["args"]
    for name in ("root_sequence", "token_id", "amount", "nonce", "amount_blinding", "deployment",
                 "valid_after_slot", "expires_at_slot", "current_slot"):
        encoded = args[name]
        if not isinstance(encoded, str) or not encoded.isdecimal() or str(int(encoded)) != encoded:
            raise ValueError()
        args[name] = int(encoded)
    if "blinding_deltas" in args:
        args["blinding_deltas"] = [int(value) for value in args["blinding_deltas"]]
    result = prepare_sender_tin_debit(args=args, sender_opening_packet=request["senderOpening"])
    witness = result["witness"]
    public = wire(result["public"])
    public_inputs = [item for name in PUBLIC_FIELDS for item in
                     (public[name] if isinstance(public[name], list) else [public[name]])]
    return {"witness": wire(witness), "publicInputs": public_inputs, "memos": result["ownerMemos"],
            "expectedSenderOpening": {"tokenId": args["token_id"], "balance": str(witness["newBalances"][0]),
                                  "blinding": str(witness["newBlindings"][0]),
                                  "sequence": str(witness["sequences"][0] + 1),
                                  "previousMemoCommitment": hex_field(witness["memoCommitments"][0])},
            "ownerHeads": [{"tokenId": args["token_id"],
                                  "sequence": str(witness["sequences"][leg] + 1),
                                  "previousMemoCommitment": hex_field(witness["memoCommitments"][leg])} for leg in range(2)]}


if __name__ == "__main__":
    try:
        raw = sys.stdin.buffer.read(256 * 1024 + 1)
        if len(raw) > 256 * 1024:
            raise ValueError()
        request = json.loads(raw)
        mode = request.pop("mode")
        result = bootstrap(request) if mode == "bootstrap" else prepare(request) if mode == "prepare" else None
        if result is None:
            raise ValueError()
        sys.stdout.write(json.dumps(result, separators=(",", ":")))
    except Exception:
        sys.stderr.write("GPRU_OFFLINE_OWNER_BRIDGE_FAILED\n")
        sys.exit(1)
