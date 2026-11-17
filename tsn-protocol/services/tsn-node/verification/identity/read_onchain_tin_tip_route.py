"""read_onchain_tin_tip_route: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from dbrix_transaction_record import BN254_SCALAR_MODULUS
from fastapi import HTTPException
from typing import Any
from typing import Optional
import binascii
import hashlib
import hmac
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TINS_LOOKUP_SECRET: Any
    decode_private_tin_route_material: Callable[..., Any]
    get_private_tin_pda: Callable[..., Any]
    read_tins_account_data: Callable[..., Any]


async def read_onchain_tin_tip_route(node: Dependencies, tin: str) -> Optional[dict[str, Any]]:
    """Resolve only the current protocol-neutral private TIN V1 TIP route."""
    try:
        lookup_commitment = hashlib.sha256(
            b"TSN_TIN_V1_LOOKUP" + node.TINS_LOOKUP_SECRET.encode("utf-8") + str(tin).encode("utf-8")
        ).digest()
        identity = node.get_private_tin_pda(tin)
        data = await node.read_tins_account_data(identity)
        if not data:
            return None
        material = node.decode_private_tin_route_material(data)
        if not hmac.compare_digest(bytes.fromhex(material["lookupCommitment"]), lookup_commitment):
            return None
        if int(material.get("tipRouteVersion") or 0) != 1:
            return None
        gpru_elgamal_public_key = bytes.fromhex(material["gpruElgamalPublicKey"])
        gpru_elgamal_key_commitment = bytes.fromhex(material["gpruElgamalKeyCommitment"])
        balance_scan_x = bytes.fromhex(material["gpruBalanceScanPublicKeyX"])
        balance_scan_y = bytes.fromhex(material["gpruBalanceScanPublicKeyY"])
        if int(material.get("gpruBalanceScanKeyVersion") or 0) != 1 or len(balance_scan_x) != 32 or len(balance_scan_y) != 32:
            return None
        scan_x, scan_y = int.from_bytes(balance_scan_x, "big"), int.from_bytes(balance_scan_y, "big")
        if scan_x >= BN254_SCALAR_MODULUS or scan_y >= BN254_SCALAR_MODULUS or (
            168700 * scan_x * scan_x + scan_y * scan_y - 1 - 168696 * scan_x * scan_x * scan_y * scan_y
        ) % BN254_SCALAR_MODULUS != 0:
            return None
        if int(material.get("gpruElgamalKeyVersion") or 0) != 1 or len(gpru_elgamal_public_key) != 32:
            return None
        expected_key_commitment = hashlib.sha256(
            b"TSN_GPRU_ELGAMAL_KEY_COMMITMENT_V1\0"
            + bytes([int(material["gpruElgamalKeyVersion"])])
            + gpru_elgamal_public_key
        ).digest()
        if not hmac.compare_digest(expected_key_commitment, gpru_elgamal_key_commitment):
            return None
        tip_root_commitment = hashlib.sha256(
            b"TSN_TIP_ROOT_COMMITMENT_V1\0" + gpru_elgamal_key_commitment
        ).hexdigest()
        return {
            "tin": str(tin),
            "lookupCommitment": material["lookupCommitment"],
            "ownerPubkeyHash": material["ownerPubkeyHash"],
            "tipRouteVersion": 1,
            "gpruElgamalKeyVersion": material["gpruElgamalKeyVersion"],
            "gpruElgamalPublicKey": gpru_elgamal_public_key.hex(),
            "gpruElgamalKeyCommitment": gpru_elgamal_key_commitment.hex(),
            "gpruBalanceScanKeyVersion": 1,
            "gpruBalanceScanPublicKeyX": balance_scan_x.hex(),
            "gpruBalanceScanPublicKeyY": balance_scan_y.hex(),
            "tipRootCommitment": tip_root_commitment,
            "policyCommitment": material["policyCommitment"],
        }
    except (HTTPException, ValueError, TypeError, binascii.Error):
        return None
