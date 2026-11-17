"""_read_tcap_shared_replay_root: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
import base64
import binascii
import hashlib
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TCAP_PROGRAM_ID: Any
    solana_rpc: Callable[..., Any]


async def _read_tcap_shared_replay_root(node: Dependencies) -> tuple[str, bytes, int]:
    program = Pubkey.from_string(node.TCAP_PROGRAM_ID)
    root, _ = Pubkey.find_program_address([b"tcap:commitment-root:v1"], program)
    response = await node.solana_rpc("getAccountInfo", [str(root), {"encoding": "base64", "commitment": "confirmed"}])
    value = ((response.get("result") or {}).get("value"))
    if not isinstance(value, dict) or str(value.get("owner") or "") != node.TCAP_PROGRAM_ID:
        raise ValueError("TCAP shared replay root is missing or has the wrong owner")
    encoded = (value.get("data") or [None])[0]
    try:
        data = base64.b64decode(encoded, validate=True)
    except (TypeError, ValueError, binascii.Error) as exc:
        raise ValueError("TCAP shared replay root data is invalid") from exc
    discriminator = hashlib.sha256(b"account:TcapCommitmentRootStateV1").digest()[:8]
    if len(data) != 124 or data[:8] != discriminator or int.from_bytes(data[8:10], "little") != 1:
        raise ValueError("TCAP shared replay root account layout or version is unsupported")
    if data[122] != 0:
        raise ValueError("TCAP shared replay root is paused")
    return str(root), data[12:44], int.from_bytes(data[80:88], "little")
