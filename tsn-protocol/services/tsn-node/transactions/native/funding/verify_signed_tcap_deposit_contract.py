"""_verify_signed_tcap_deposit_contract: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
import hashlib
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TCAP_PROGRAM_ID: Any
    _parse_signed_tcap_deposit_instructions: Callable[..., Any]
    _select_tcap_private_funding_deposit: Callable[..., Any]
    funding_root_address: Callable[..., Any]


def _verify_signed_tcap_deposit_contract(node: Dependencies,
    *, transaction_base64: str, transition: dict[str, Any], wallet: str,
) -> None:
    accounts = transition.get("depositAccounts")
    if not isinstance(accounts, dict):
        raise ValueError("TCAP deposit account contract is missing")
    amount = int(str(transition.get("depositAmountBaseUnits") or "0"))
    expected_deposit_accounts = [
        wallet, accounts.get("config"), accounts.get("assetEntry"),
        accounts.get("reserveState"), accounts.get("source"), accounts.get("vault"),
        accounts.get("mint"), accounts.get("tokenProgram"), accounts.get("fundingRootAccount"),
    ]
    if amount <= 0 or accounts.get("depositor") != wallet:
        raise ValueError("TCAP deposit amount or sender does not match the signed intent")
    instructions = node._parse_signed_tcap_deposit_instructions(transaction_base64)
    deposit_disc = hashlib.sha256(b"global:deposit_private_funding_v1").digest()[:8]
    deposit = node._select_tcap_private_funding_deposit(instructions)
    if deposit[0] != node.TCAP_PROGRAM_ID or deposit[1] != expected_deposit_accounts or len(deposit[2]) != 48 or deposit[2][:8] != deposit_disc or int.from_bytes(deposit[2][8:16], "little") != amount or deposit[2][16:48].hex() != transition.get("fundingNoteCommitment") or accounts.get("fundingRootAccount") != str(node.funding_root_address(node.TCAP_PROGRAM_ID)[0]):
        raise ValueError("Wallet funding transaction does not contain the exact TCAP private funded-note deposit instruction")
