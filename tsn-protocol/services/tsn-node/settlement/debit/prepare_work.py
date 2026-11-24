"""Verify sender approval and prepare the paired confidential debit transition."""
import asyncio
import os
from pathlib import Path
from .read_context import read_debit_context
from .preparation.prepare_sender_tin_debit import prepare_sender_tin_debit
from .contract import PUBLIC_FIELDS
from .digest import debit_digest
from .accounts import debit_accounts
from .prove import prove_debit
from .publish_candidate import publish_debit_candidate
from .wire import debit_instructions
from settlement.witness._read_snapshot import _read_snapshot


from typing import Any, Callable, Protocol


class Dependencies(Protocol):
    TSN_PROGRAM_ID: str
    TCAP_PROGRAM_ID: str
    GPRU_PROGRAM_ID: str
    TINS_PROGRAM_ID: str
    TOKEN_PROGRAM_ID: Any
    TOKEN_2022_PROGRAM_ID: Any
    solana_rpc: Callable[..., Any]
    get_mother_escrow_pda: Callable[..., Any]
    read_onchain_tin_tip_route: Callable[..., Any]
    clean_env: Callable[..., Any]
    ensure_tip_snapshot: Callable[..., Any]
    get_tins_program_pubkey: Callable[..., Any]


async def prepare_debit_work(node: Dependencies, work: dict) -> dict:
    payload = work["payload"]
    context = await read_debit_context(node, payload["tokenMintAddress"])
    sender = await node.read_onchain_tin_tip_route(payload["senderTin"])
    recipient = await node.read_onchain_tin_tip_route(payload["recipientTin"])
    if not sender or not recipient or sender["tin"] == recipient["tin"]:
        raise ValueError("TIN_DEBIT_ROUTES_UNAVAILABLE")
    directory_text = node.clean_env(os.environ.get("GPRU_HIDDEN_HEAD_WITNESS_DIR"))
    if not directory_text:
        raise RuntimeError("GPRU_HIDDEN_HEAD_WITNESS_UNAVAILABLE")
    directory = Path(directory_text)
    await node.ensure_tip_snapshot(directory, context["tipRoot"], node.solana_rpc, tip_program=node.get_tins_program_pubkey())
    state = await asyncio.to_thread(_read_snapshot, directory / f"tcap-{context['oldRoot']}.json")
    tip = await asyncio.to_thread(_read_snapshot, directory / f"tip-{context['tipRoot']}.json")
    if payload["deploymentCommitment"] != context["deploymentCommitment"]:
        raise ValueError("TIN_DEBIT_DEPLOYMENT_CHANGED")
    args = {"state": state, "tip_snapshot": tip, "old_root": context["oldRoot"], "tip_root": context["tipRoot"],
        "root_sequence": context["rootSequence"], "sender_route": sender, "recipient_route": recipient,
        "token_id": context["asset"]["tokenId"], "amount": int(payload["amountBaseUnits"]), "nonce": int(payload["nonce"]),
        "amount_blinding": int(payload["amountBlinding"]), "deployment": int(payload["deploymentCommitment"], 16),
        "valid_after_slot": int(payload["validAfterSlot"]), "expires_at_slot": int(payload["expiresAtSlot"]),
        "current_slot": context["slot"], "approval": payload["approval"], "sender_owner_commitment": sender["ownerPubkeyHash"], "reserve": context["reserve"]}
    prepared = await asyncio.to_thread(prepare_sender_tin_debit, args=args, sender_opening_packet=payload["senderOpening"])
    witness = prepared["witness"]
    # Nested Merkle paths are converted by JSON's explicit recursive serializer.
    from .witness_strings import witness_strings
    proof = await prove_debit(witness_strings(witness), context["verifier"], context["verifierBump"])
    inputs = proof["publicInputs"]
    digest = debit_digest(context["accounts"], inputs)
    accounts = debit_accounts(node, context["asset"]["assetEntry"], context["accounts"]["authority"], digest)
    transition = {**accounts, "proof": proof, "memoPayloads": prepared["ownerMemos"], "authorizationDigest": digest,
        "tokenId": context["asset"]["tokenId"], "amountCommitment": inputs[8], "authorizationCommitment": inputs[9],
        "actionCommitment": inputs[10], "nullifier": inputs[11], "previousTcapRoot": inputs[0], "newTcapRoot": inputs[1],
        "tcapRootSequence": str(int(inputs[3], 16) + 1), "validAfterSlot": str(int(inputs[6], 16)),
        "expiresAtSlot": str(int(inputs[7], 16)), "deploymentCommitment": inputs[4]}
    debit_instructions(node, transition)
    current = await read_debit_context(node, payload["tokenMintAddress"], context["slot"])
    if current["oldRoot"] != context["oldRoot"] or current["rootSequence"] != context["rootSequence"] or current["tipRoot"] != context["tipRoot"] or current["verifier"] != context["verifier"]:
        raise ValueError("TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT")
    await asyncio.to_thread(publish_debit_candidate, directory, inputs[1], prepared["candidate"])
    return {"verifiedPayload": {"tcapTinDebitTransition": transition}, "verificationType": "TSN_TIN_DEBIT_V1"}
