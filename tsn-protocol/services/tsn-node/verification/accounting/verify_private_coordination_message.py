"""_verify_private_coordination_message: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from fastapi import HTTPException
import hashlib
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    GPRU_PROGRAM_ID: Any
    TCAP_PROGRAM_ID: Any
    _parse_solana_v1_message: Callable[..., Any]
    get_mother_escrow_pda: Callable[..., Any]


def _verify_private_coordination_message(node: Dependencies, message: bytes, operator: str, authority: str, kind: str, value: dict) -> bytes:
    if kind != "TCAP_EPOCH_ACCOUNTING":
        raise HTTPException(403,"PRIVATE_COORDINATION_KIND_INVALID")
    required, readonly_signed, readonly_unsigned, keys, blockhash, instructions = node._parse_solana_v1_message(message)
    if required != 2 or readonly_signed != 0 or keys[:2] != [operator,authority] or len(message)+128 > 4096:
        raise HTTPException(403,"PRIVATE_COORDINATION_SIGNERS_INVALID")
    mother = str(node.get_mother_escrow_pda())
    verifier = str(Pubkey.find_program_address([b"gpru:tcap-epoch-verifier:v1"],Pubkey.from_string(node.GPRU_PROGRAM_ID))[0])
    accounts = [authority,mother,value["tcapConfig"],value["assetEntry"],value["reserveState"],value["accountingEpoch"],verifier,node.GPRU_PROGRAM_ID]
    proof = value["proof"]
    data = hashlib.sha256(b"global:account_credit_epoch_v1").digest()[:8]+int(value["total"]).to_bytes(8,"little")+b"".join(bytes.fromhex(v) for v in proof["publicInputs"])+b"".join(bytes.fromhex(proof[v]) for v in ("proofA","proofB","proofC"))
    writable = {value["reserveState"],value["accountingEpoch"]}
    if instructions != [(node.TCAP_PROGRAM_ID,accounts,data)] or set(keys) != {operator,node.TCAP_PROGRAM_ID,*accounts}:
        raise HTTPException(403,"PRIVATE_COORDINATION_MESSAGE_MISMATCH")
    n = len(keys)-required-readonly_unsigned
    if n < 0 or set(keys[required:required+n]) != writable or not any(blockhash):
        raise HTTPException(403,"PRIVATE_COORDINATION_ACCOUNT_PERMISSIONS_INVALID")
    return blockhash
