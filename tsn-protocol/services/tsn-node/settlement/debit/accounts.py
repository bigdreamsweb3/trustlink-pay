"""Derive the exact debit program accounts and deployment commitment."""
import hashlib
from app.solana_pubkey import Pubkey
from .contract import CONTEXT_FIELDS, FIELD


from typing import Any, Callable, Protocol


class Dependencies(Protocol):
    TSN_PROGRAM_ID: str
    TCAP_PROGRAM_ID: str
    GPRU_PROGRAM_ID: str
    TINS_PROGRAM_ID: str


def debit_accounts(node: Dependencies, asset_entry: str, authority: str, digest: str = "00" * 32) -> dict:
    tsnp = Pubkey.from_string(node.TSN_PROGRAM_ID)
    tcap = Pubkey.from_string(node.TCAP_PROGRAM_ID)
    gpru = Pubkey.from_string(node.GPRU_PROGRAM_ID)
    tip = Pubkey.from_string(node.TINS_PROGRAM_ID)
    asset = Pubkey.from_string(asset_entry)
    accounts = {"authority": authority, "tsnProgram": str(tsnp), "tcapProgram": str(tcap), "gpruProgram": str(gpru), "tipProgram": str(tip), "assetEntry": str(asset)}
    for name, seeds, program in (("motherEscrow", [b"tsn_mother_escrow"], tsnp),
        ("config", [b"tcap:global-config:v1"], tcap), ("commitmentRoot", [b"tcap:commitment-root:v1"], tcap),
        ("reserveState", [b"tcap:reserve-state:v1", bytes(asset)], tcap),
        ("authorizationSigner", [b"tsn:tcap-authorization:v1", bytes.fromhex(digest)], tsnp),
        ("tipRouteRoot", [b"tip:route-merkle-root:v1"], tip), ("tinDebitVerifier", [b"gpru:tin-debit-verifier:v1"], gpru)):
        accounts[name] = str(Pubkey.find_program_address(seeds, program)[0])
    accounts["instructions"] = "Sysvar1nstructions1111111111111111111111111"
    return accounts
