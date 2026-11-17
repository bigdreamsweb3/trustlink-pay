"""_read_gpru_proof_accounts: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from dbrix_transaction_record import BN254_SCALAR_MODULUS
import base64
import binascii
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    GPRU_PROGRAM_ID: Any
    TINS_PROGRAM_ID: Any
    solana_rpc: Callable[..., Any]


async def _read_gpru_proof_accounts(node: Dependencies) -> tuple[str, bytes, int]:
    tip, tip_bump = Pubkey.find_program_address([b"tip:route-merkle-root:v1"], Pubkey.from_string(node.TINS_PROGRAM_ID))
    verifier, verifier_bump = Pubkey.find_program_address([b"gpru:hidden-head-verifier:v1"], Pubkey.from_string(node.GPRU_PROGRAM_ID))
    response = await node.solana_rpc("getMultipleAccounts", [[str(tip), str(verifier)], {"encoding": "base64", "commitment": "confirmed"}])
    values = (response.get("result") or {}).get("value")
    if not isinstance(values, list) or len(values) != 2:
        raise ValueError("GPRU proof accounts are missing")
    decoded = []
    for value, owner in zip(values, (node.TINS_PROGRAM_ID, node.GPRU_PROGRAM_ID)):
        if not isinstance(value, dict) or value.get("owner") != owner:
            raise ValueError("GPRU proof account is missing or has the wrong owner")
        try:
            decoded.append(base64.b64decode(value["data"][0], validate=True))
        except (ValueError, TypeError, KeyError, IndexError, binascii.Error) as exc:
            raise ValueError("GPRU proof account encoding is invalid") from exc
    data = decoded[0]
    if (len(data) < 42 or data[0] != 1 or data[1] != tip_bump or int.from_bytes(data[34:42], "little") == 0
            or not 0 < int.from_bytes(data[2:34], "big") < BN254_SCALAR_MODULUS):
        raise ValueError("TIP route root is unavailable or has an unsupported layout")
    return data[2:34].hex(), decoded[1], verifier_bump
