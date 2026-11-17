"""_verify_mother_signed_tcap_settlement_message: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from fastapi import HTTPException
from typing import Any
import hashlib
import hmac
import re
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    SOLANA_V1_TRANSACTION_SIZE_LIMIT: Any
    TCAP_PROGRAM_ID: Any
    TINS_PROGRAM_ID: Any
    TSN_PROGRAM_ID: Any
    _parse_solana_v1_message: Callable[..., Any]
    _tcap_credit_bytes32: Callable[..., Any]
    _tcap_credit_u64: Callable[..., Any]
    get_mother_escrow_pda: Callable[..., Any]


def _verify_mother_signed_tcap_settlement_message(node: Dependencies,
    message: bytes,
    *,
    operator: str,
    authority: str,
    transition: dict[str, Any],
) -> bytes:
    required_signatures, readonly_signed, readonly_unsigned, account_keys, recent_blockhash, instructions = node._parse_solana_v1_message(message)
    # V1 puts signatures after the message without a signature-count prefix.
    if len(message) + required_signatures * 64 > node.SOLANA_V1_TRANSACTION_SIZE_LIMIT:
        raise HTTPException(422, "Settlement transaction exceeds the Solana v1 4096-byte limit")
    if required_signatures != 2 or readonly_signed != 0 or len(account_keys) < required_signatures:
        raise HTTPException(422, "Settlement transaction must have exactly Cranker and Mother writable signers")
    if account_keys[0] != operator or account_keys[1] != authority:
        raise HTTPException(403, "Settlement transaction signer order does not match its leased Cranker and Mother")
    if not any(recent_blockhash):
        raise HTTPException(422, "Settlement transaction has no recent blockhash")

    previous_tcap_root = node._tcap_credit_bytes32(transition.get("previousTcapRoot"), "previousTcapRoot")
    tcap_root_sequence = node._tcap_credit_u64(transition.get("tcapRootSequence"), "tcapRootSequence")
    authorization_digest = node._tcap_credit_bytes32(transition.get("authorizationDigest"), "authorizationDigest")
    try:
        token_id = int(transition.get("tokenId"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, "Node TCAP transition tokenId is invalid") from exc
    if token_id <= 0 or token_id > 0xFFFFFFFF:
        raise HTTPException(422, "Node TCAP transition tokenId is outside the u32 range")
    proof = transition["proof"]
    public_inputs = b"".join(
        node._tcap_credit_bytes32(value, f"proof.publicInputs[{index}]")
        for index, value in enumerate(proof["publicInputs"])
    )
    proof_bytes = b"".join(
        bytes.fromhex(str(proof[name]).removeprefix("0x"))
        for name in ("proofA", "proofB", "proofC")
    )
    proof_action_kind = int(proof["actionKind"])
    proof_token_id = int(proof["tokenId"])
    proof_amount_commitment = node._tcap_credit_bytes32(proof["amountCommitment"], "proof.amountCommitment")
    proof_authorization_commitment = node._tcap_credit_bytes32(
        proof["authorizationCommitment"], "proof.authorizationCommitment",
    )
    if (len(public_inputs) != 13 * 32 or len(proof_bytes) != 64 + 128 + 64
            or proof_action_kind != 1 or proof_token_id != token_id or proof_amount_commitment != node._tcap_credit_bytes32(transition["amountCommitment"], "amountCommitment")):
        raise HTTPException(422, "GPRU proof payload does not match the canonical TCAP credit instruction layout")
    args = b"".join((
        authorization_digest,
        node._tcap_credit_u64(transition.get("validAfterSlot"), "validAfterSlot"),
        node._tcap_credit_u64(transition.get("expiresAtSlot"), "expiresAtSlot"),
        previous_tcap_root,
        tcap_root_sequence,
        token_id.to_bytes(4, "little"),
        node._tcap_credit_bytes32(transition.get("amountCommitment"), "amountCommitment"),
        node._tcap_credit_bytes32(transition.get("nullifier"), "nullifier"),
        public_inputs,
        proof_bytes,
        bytes([proof_action_kind]),
        proof_token_id.to_bytes(4, "little"),
        proof_amount_commitment,
        proof_authorization_commitment,
    ))
    tsn_program = Pubkey.from_string(node.TSN_PROGRAM_ID)
    tcap_program = Pubkey.from_string(node.TCAP_PROGRAM_ID)
    mother_escrow = node.get_mother_escrow_pda()
    asset_entry = Pubkey.from_string(str(transition.get("assetEntry") or ""))
    config = Pubkey.from_string(str(transition.get("tcapConfig") or ""))
    commitment_root = Pubkey.from_string(str(transition.get("commitmentRoot") or ""))
    reserve_state = Pubkey.from_string(str(transition.get("reserveState") or ""))
    tip_program = Pubkey.from_string(node.TINS_PROGRAM_ID)
    tip_route_root = Pubkey.find_program_address([b"tip:route-merkle-root:v1"], tip_program)[0]
    gpru_program = Pubkey.from_string("6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR")
    gpru_verifier = Pubkey.find_program_address([b"gpru:hidden-head-verifier:v1"], gpru_program)[0]
    instructions_sysvar = "Sysvar1nstructions1111111111111111111111111"
    auth_signer = Pubkey.find_program_address(
        [b"tsn:tcap-authorization:v1", authorization_digest], tsn_program,
    )[0]
    register_instruction = (
        node.TSN_PROGRAM_ID,
        [
            authority, str(mother_escrow), str(tcap_program), node.TSN_PROGRAM_ID,
            str(config), str(asset_entry), str(commitment_root), str(reserve_state),
            str(auth_signer), str(tip_route_root), str(gpru_verifier), instructions_sysvar, str(gpru_program), transition["fundingRootAccount"], transition["accountingEpoch"], "11111111111111111111111111111111",
        ],
        hashlib.sha256(b"global:tsn_register_tcap_credit_authorization_v3").digest()[:8] + args,
    )
    expected_instructions: list[tuple[str, list[str], bytes]] = [register_instruction]
    expected_keys = {
        operator, authority, str(mother_escrow), str(tcap_program), node.TSN_PROGRAM_ID,
        str(config), str(asset_entry), str(commitment_root), str(reserve_state), str(auth_signer),
        str(tip_route_root), str(gpru_verifier), instructions_sysvar, str(gpru_program), transition["fundingRootAccount"], transition["accountingEpoch"], "11111111111111111111111111111111",
    }
    memo_payload = str(transition.get("memoPayload") or "")
    if not re.fullmatch(r"TSN_GPRU_HEAD_V1:(?:[0-9a-f]{64}:){7}[A-Za-z0-9_-]+", memo_payload):
        raise HTTPException(422, "Node TCAP transition has an invalid proof-bound DBrix Ledger Memo")
    memo_commitment = hashlib.sha256(memo_payload.encode("ascii")).digest()
    if not hmac.compare_digest(memo_commitment, node._tcap_credit_bytes32(transition.get("memoCommitment"), "memoCommitment")):
        raise HTTPException(403, "DBrix Memo payload does not match the authorized memo commitment")
    memo_program = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
    expected_instructions.append((memo_program, [operator], memo_payload.encode("ascii")))
    expected_keys.add(memo_program)
    if instructions != expected_instructions or set(account_keys) != expected_keys:
        raise HTTPException(403, "Settlement transaction does not exactly match the Node-verified TCAP transition")
    writable_unsigned_count = len(account_keys) - required_signatures - readonly_unsigned
    expected_writable_unsigned = {str(commitment_root), transition["accountingEpoch"]}
    if writable_unsigned_count < 0 or set(account_keys[required_signatures:required_signatures + writable_unsigned_count]) != expected_writable_unsigned:
        raise HTTPException(422, "Settlement transaction has unexpected writable accounts")
    return recent_blockhash
