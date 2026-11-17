"""_construct_verified_tcap_transition: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from dbrix_transaction_record import BN254_SCALAR_MODULUS
from pathlib import Path
from private_credit_coordination import PrivateCreditWait
from typing import Any
import asyncio
import hashlib
import os
import secrets
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    HiddenHeadWitnessStore: Callable[..., Any]
    TCAP_PROGRAM_ID: Any
    _assert_recipient_hash_matches_owner: Callable[..., Any]
    _assert_tcap_credit_transport_capacity: Callable[..., Any]
    _assert_tcap_gpru_credit_program_preconditions: Callable[..., Any]
    _current_credit_epoch: Callable[..., Any]
    _read_gpru_proof_accounts: Callable[..., Any]
    _read_tcap_shared_replay_root: Callable[..., Any]
    _settlement_funding_context: Callable[..., Any]
    _validate_tcap_credit_digest: Callable[..., Any]
    clean_env: Callable[..., Any]
    credit_amount_commitment: Callable[..., Any]
    derive_node_record_shared_point: Callable[..., Any]
    encrypt_transaction_record_v1: Callable[..., Any]
    ensure_funding_snapshot: Callable[..., Any]
    ensure_tip_snapshot: Callable[..., Any]
    funding_membership: Callable[..., Any]
    get_tins_program_pubkey: Callable[..., Any]
    hex_field: Any
    logger: Any
    prove_hidden_head_credit: Callable[..., Any]
    read_funding_root: Callable[..., Any]
    read_onchain_tin_tip_route: Callable[..., Any]
    solana_rpc: Callable[..., Any]


async def _construct_verified_tcap_transition(node: Dependencies, funding: dict[str, Any]) -> dict[str, Any]:
    directory = node.clean_env(os.environ.get("GPRU_HIDDEN_HEAD_WITNESS_DIR"))
    if not directory:
        raise RuntimeError("GPRU_HIDDEN_HEAD_WITNESS_UNAVAILABLE: configure the root-indexed snapshot directory")
    request, asset, funding_context = await node._settlement_funding_context(funding)
    route = await node.read_onchain_tin_tip_route(request.recipientTin)
    if not route:
        raise ValueError("Settlement recipient has no active TIP route")
    node._assert_recipient_hash_matches_owner(request.recipientHash, route["ownerPubkeyHash"])
    root_address, old_root, root_sequence = await node._read_tcap_shared_replay_root()
    tip_root, verifier_data, verifier_bump = await node._read_gpru_proof_accounts()
    funded_state = await node.read_funding_root(node.solana_rpc, node.TCAP_PROGRAM_ID)
    funded_snapshot = await node.ensure_funding_snapshot(Path(directory), funded_state, node.solana_rpc, node.TCAP_PROGRAM_ID)
    membership = node.funding_membership(funded_snapshot, request.fundingNote["commitment"], asset["tokenId"], int(funding_context["depositAmountBaseUnits"]))
    snapshot = await node.ensure_tip_snapshot(Path(directory), tip_root, node.solana_rpc, tip_program=node.get_tins_program_pubkey())
    if snapshot["published"]:
        node.logger.info("TIP witness snapshot synchronized: routes=%s", snapshot["routeCount"])
    slot_response = await node.solana_rpc("getSlot", [{"commitment": "confirmed"}])
    slot = int(slot_response.get("result") or 0)
    if slot <= 0 or root_sequence == 0xFFFFFFFFFFFFFFFF:
        raise ValueError("TCAP root sequence or current slot is unavailable")
    ttl = int(os.environ.get("TSN_GPRU_CREDIT_TTL_SLOTS", "2000"))
    if not 1 <= ttl <= 10_000:
        raise ValueError("TCAP credit validity window is out of range")
    amount = int(funding_context["depositAmountBaseUnits"])
    blinding = secrets.randbelow(BN254_SCALAR_MODULUS - 1) + 1
    amount_commitment = node.hex_field(node.credit_amount_commitment(asset["tokenId"], amount, blinding, int(funding_context["nullifier"], 16)))
    epoch_address, _ = await node._current_credit_epoch(asset["assetEntry"], funding_context["depositAccounts"]["reserveState"])
    transition = {
        "commitmentRoot": root_address, "previousTcapRoot": old_root.hex(), "tcapRootSequence": str(root_sequence + 1),
        "tokenId": asset["tokenId"], "amountCommitment": amount_commitment, "accountingEpoch": epoch_address, "nullifier": funding_context["nullifier"],
        "validAfterSlot": str(slot), "expiresAtSlot": str(slot + ttl),
        "tcapConfig": funding_context["depositAccounts"]["config"], "assetEntry": asset["assetEntry"],
        "reserveState": funding_context["depositAccounts"]["reserveState"], "fundingRootAccount": funded_state["address"],
    }
    digest = hashlib.sha256(b"".join((
        b"TSN_GPRU_TCAP_CREDIT_PRIVATE_V2\0", bytes(Pubkey.from_string(root_address)), old_root,
        (root_sequence + 1).to_bytes(8, "little"), slot.to_bytes(8, "little"), (slot + ttl).to_bytes(8, "little"),
        bytes.fromhex(amount_commitment), asset["tokenId"].to_bytes(4, "little"), bytes.fromhex(transition["nullifier"]), bytes.fromhex(funded_state["root"]),
        bytes(Pubkey.from_string(epoch_address)), bytes(Pubkey.from_string(funded_state["address"])),
    ))).digest()
    transition["authorizationDigest"] = digest.hex()
    authorization = node.hex_field(int.from_bytes(digest, "big") % BN254_SCALAR_MODULUS)
    store = node.HiddenHeadWitnessStore(Path(directory))
    prepared = await asyncio.to_thread(store.prepare_credit, old_root=old_root.hex(), tip_root=tip_root, route=route,
                                       token_id=asset["tokenId"], amount=amount, authorization=authorization, nullifier=transition["nullifier"],
                                       funding_note=request.fundingNote, funding_membership=membership, amount_blinding=blinding)
    witness = prepared["witness"]
    ephemeral, shared = await asyncio.to_thread(node.derive_node_record_shared_point, bytes.fromhex(route["gpruElgamalPublicKey"]))
    dna = secrets.token_bytes(32)
    binding = {name: node.hex_field(witness[name]) for name in ("successorPortfolioRoot", "successorBalanceX", "successorBalanceY", "actionCommitment", "authorizationCommitment", "nullifier")}
    memo = node.encrypt_transaction_record_v1(
        record={"version": 2, "recordType": "tsn-gpru-balance-action-v2", "sequence": str(prepared["sequence"]),
                "previousMemoCommitment": prepared["previousMemoCommitment"], "actionCommitment": binding["actionCommitment"],
                "authorizationCommitment": authorization, "nullifier": transition["nullifier"], "actionKind": 1,
                "tokenId": asset["tokenId"], "amountBaseUnits": str(amount),
                 "amountBlinding": node.hex_field(blinding), "amountCommitment": amount_commitment},
        shared_point=shared, record_ephemeral_public_key=ephemeral, dna=dna,
        encrypted_blinding_delta=node.hex_field(witness["encryptedBlindingDelta"]),
        delta_ephemeral_public_x=node.hex_field(witness["deltaEphemeralPublicX"]), delta_ephemeral_public_y=node.hex_field(witness["deltaEphemeralPublicY"]), memo_binding=binding,
    )
    node._assert_tcap_credit_transport_capacity(memo["memoPayload"])
    store.finish_credit(prepared, memo["memoCommitmentField"])
    proof = await node.prove_hidden_head_credit(witness, verifier_data, verifier_bump)
    transition.update(memo, proof=proof, dna=dna.hex(), actionCommitment=binding["actionCommitment"])
    node._validate_tcap_credit_digest(transition)
    await node._assert_tcap_gpru_credit_program_preconditions(transition)
    current_tip, current_verifier, current_bump = await node._read_gpru_proof_accounts()
    if current_tip != tip_root or current_verifier != verifier_data or current_bump != verifier_bump:
        raise PrivateCreditWait("GPRU_PROOF_CONTEXT_CHANGED_DURING_PROVING")
    await asyncio.to_thread(store.save_candidate, prepared)
    # No private witness, sequence, paths, prior commitments or delta is part
    # of the Receiver decision. The full owner record is encrypted in Memo.
    return transition
