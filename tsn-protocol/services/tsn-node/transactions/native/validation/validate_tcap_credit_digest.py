"""_validate_tcap_credit_digest: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from dbrix_transaction_record import BN254_SCALAR_MODULUS
from typing import Any
import hashlib
import hmac
import re
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TCAP_PROGRAM_ID: Any
    _tcap_credit_bytes32: Callable[..., Any]
    _tcap_credit_u64: Callable[..., Any]
    funding_root_address: Callable[..., Any]
    validate_transaction_record_v1: Callable[..., Any]


def _validate_tcap_credit_digest(node: Dependencies, transition: dict[str, Any]) -> str:
    node.validate_transaction_record_v1(transition)
    nonce = node._tcap_credit_bytes32(transition.get("nullifier"), "nullifier")
    valid_after = node._tcap_credit_u64(transition.get("validAfterSlot"), "validAfterSlot")
    expires = node._tcap_credit_u64(transition.get("expiresAtSlot"), "expiresAtSlot")
    previous_tcap_root = node._tcap_credit_bytes32(transition.get("previousTcapRoot"), "previousTcapRoot")
    tcap_root_sequence = node._tcap_credit_u64(transition.get("tcapRootSequence"), "tcapRootSequence")
    authorization_digest = node._tcap_credit_bytes32(transition.get("authorizationDigest"), "authorizationDigest")
    token_id = int(transition.get("tokenId") or 0)
    if token_id <= 0 or token_id > 0xFFFFFFFF:
        raise ValueError("TCAP credit tokenId is out of range")
    amount_commitment = node._tcap_credit_bytes32(transition.get("amountCommitment"), "amountCommitment")
    if not 0 < int.from_bytes(amount_commitment, "big") < BN254_SCALAR_MODULUS:
        raise ValueError("TCAP credit amount commitment is invalid")
    if "amountBaseUnits" in transition or "amount" in (transition.get("proof") or {}):
        raise ValueError("PUBLIC_CREDIT_AMOUNT_FORBIDDEN")
    if previous_tcap_root == bytes(32) or nonce == bytes(32):
        raise ValueError("TCAP credit predecessor root and nullifier must be nonzero")
    if int.from_bytes(tcap_root_sequence, "little") <= 0 or int.from_bytes(expires, "little") < int.from_bytes(valid_after, "little"):
        raise ValueError("TCAP credit root sequence or validity window is invalid")

    tcap_program = Pubkey.from_string(node.TCAP_PROGRAM_ID)
    commitment_root, _ = Pubkey.find_program_address([b"tcap:commitment-root:v1"], tcap_program)
    if str(transition.get("commitmentRoot") or "") != str(commitment_root):
        raise ValueError("TCAP shared replay root is not the canonical checkpoint PDA")
    proof = transition.get("proof")
    if not isinstance(proof, dict):
        raise ValueError("TCAP transition is missing the GPRU hidden-head proof")
    raw_inputs = proof.get("publicInputs")
    if not isinstance(raw_inputs, list) or len(raw_inputs) != 13:
        raise ValueError("GPRU hidden-head proof must contain exactly thirteen public inputs")
    inputs = [node._tcap_credit_bytes32(value, f"proof.publicInputs[{index}]") for index, value in enumerate(raw_inputs)]
    if any(int.from_bytes(value, "big") >= 21888242871839275222246405745257275088548364400416034343698204186575808495617 for value in inputs):
        raise ValueError("GPRU hidden-head public inputs must be canonical BN254 field elements")
    proof_a_hex = str(proof.get("proofA") or "").removeprefix("0x")
    proof_b_hex = str(proof.get("proofB") or "").removeprefix("0x")
    proof_c_hex = str(proof.get("proofC") or "").removeprefix("0x")
    if (not re.fullmatch(r"[0-9a-fA-F]{128}", proof_a_hex)
            or not re.fullmatch(r"[0-9a-fA-F]{256}", proof_b_hex)
            or not re.fullmatch(r"[0-9a-fA-F]{128}", proof_c_hex)):
        raise ValueError("GPRU Groth16 proof points must be canonical hexadecimal encodings")
    proof_a, proof_b, proof_c = bytes.fromhex(proof_a_hex), bytes.fromhex(proof_b_hex), bytes.fromhex(proof_c_hex)
    proof_commitment = node._tcap_credit_bytes32(proof.get("authorizationCommitment"), "proof.authorizationCommitment")
    if (len(proof_a), len(proof_b), len(proof_c)) != (64, 128, 64):
        raise ValueError("GPRU Groth16 proof points have invalid byte lengths")
    if (int(proof.get("actionKind", 0)) != 1 or int(proof.get("tokenId", 0)) != token_id
            or node._tcap_credit_bytes32(proof.get("amountCommitment"), "proof.amountCommitment") != amount_commitment):
        raise ValueError("GPRU proof action does not match this TCAP credit")
    digest_scalar = int.from_bytes(authorization_digest, "big") % 21888242871839275222246405745257275088548364400416034343698204186575808495617
    if int.from_bytes(proof_commitment, "big") != digest_scalar:
        raise ValueError("GPRU proof authorization commitment does not match the TSN authorization digest")
    if inputs[0] != previous_tcap_root or inputs[4] != nonce:
        raise ValueError("GPRU proof predecessor root or nullifier differs from the TCAP instruction")
    if inputs[2] != node._tcap_credit_bytes32(transition.get("memoCommitmentField"), "memoCommitmentField"):
        raise ValueError("GPRU proof Memo input differs from the canonical Memo commitment field")
    if inputs[3] != node._tcap_credit_bytes32(transition.get("actionCommitment"), "actionCommitment"):
        raise ValueError("GPRU proof action input differs from the authorized Memo action")
    memo_prefix = str(transition.get("memoPayload") or "").split(":", 8)
    if len(memo_prefix) != 9 or memo_prefix[0] != "TSN_GPRU_HEAD_V1":
        raise ValueError("GPRU Memo is missing its proof-bound balance-delta ciphertext")
    if tuple(inputs[index].hex() for index in (6, 7, 8, 3, 9, 10, 11)) != tuple(memo_prefix[1:8]):
        raise ValueError("GPRU Groth16 balance-delta ciphertext inputs do not match the Memo prefix")

    expected_digest = hashlib.sha256(b"".join((
        b"TSN_GPRU_TCAP_CREDIT_PRIVATE_V2\0",
        bytes(commitment_root),
        previous_tcap_root,
        tcap_root_sequence,
        valid_after,
        expires,
        amount_commitment,
        token_id.to_bytes(4, "little"),
        nonce,
        inputs[12],
        bytes(Pubkey.from_string(transition["accountingEpoch"])),
        bytes(Pubkey.from_string(transition["fundingRootAccount"])),
    ))).digest()
    if not hmac.compare_digest(expected_digest, authorization_digest):
        raise ValueError("TCAP authorization digest does not match the deployed hidden-head V1 contract")
    if str(transition.get("fundingRootAccount") or "") != str(node.funding_root_address(node.TCAP_PROGRAM_ID)[0]):
        raise ValueError("TCAP funding membership account is not canonical")
    if inputs[12] == bytes(32):
        raise ValueError("TCAP funding membership root must be nonzero")
    transition["tipRootCommitment"] = inputs[5].hex()
    return str(commitment_root)
