"""Read canonical debit accounts, governed reserve and current proof context."""
import base64
import hashlib
from app.solana_pubkey import Pubkey
from .accounts import debit_accounts
from .deployment import debit_deployment
from .contract import FIELD
from .resolve_debit_asset import resolve_debit_asset


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


async def read_debit_context(node: Dependencies, mint: str, minimum_slot: int = 0) -> dict:
    asset = await resolve_debit_asset(node, mint)
    root_address = str(Pubkey.find_program_address([b"tcap:commitment-root:v1"], Pubkey.from_string(node.TCAP_PROGRAM_ID))[0])
    mother = node.get_mother_escrow_pda()
    response = await node.solana_rpc("getAccountInfo", [str(mother), {"encoding": "base64", "commitment": "confirmed"}])
    value = (response.get("result") or {}).get("value") or {}
    data = base64.b64decode((value.get("data") or [""])[0], validate=True)
    if value.get("owner") != node.TSN_PROGRAM_ID or len(data) < 40 or data[:8] != hashlib.sha256(b"account:MotherEscrow").digest()[:8]:
        raise ValueError("TIN_DEBIT_MOTHER_UNAVAILABLE")
    accounts = debit_accounts(node, asset["assetEntry"], str(Pubkey(data[8:40])))
    addresses = [accounts[name] for name in ("config", "assetEntry", "reserveState", "tipRouteRoot", "tinDebitVerifier", "commitmentRoot")]
    response = await node.solana_rpc("getMultipleAccounts", [addresses, {"encoding": "base64", "commitment": "confirmed", "minContextSlot": minimum_slot}])
    result = response.get("result") or {}
    values = result.get("value")
    if not isinstance(values, list) or len(values) != 6:
        raise ValueError("TIN_DEBIT_CONTEXT_UNAVAILABLE")
    decoded = []
    for account, owner in zip(values, (node.TCAP_PROGRAM_ID,) * 3 + (node.TINS_PROGRAM_ID, node.GPRU_PROGRAM_ID, node.TCAP_PROGRAM_ID)):
        if not isinstance(account, dict) or account.get("owner") != owner:
            raise ValueError("TIN_DEBIT_ACCOUNT_OWNER_INVALID")
        decoded.append(base64.b64decode(account["data"][0], validate=True))
    config, entry, reserve, tip, verifier, root = decoded
    root_bump = Pubkey.find_program_address([b"tcap:commitment-root:v1"], Pubkey.from_string(node.TCAP_PROGRAM_ID))[1]
    if (len(root) != 124 or root[:8] != hashlib.sha256(b"account:TcapCommitmentRootStateV1").digest()[:8]
        or root[8:12] != b"\x01\x00\x01\x00" or root[122] != 0 or root[123] != root_bump
        or not 0 < int.from_bytes(root[12:44], "big") < FIELD):
        raise ValueError("TIN_DEBIT_ROOT_INVALID")
    old_root, sequence = root[12:44], int.from_bytes(root[80:88], "little")
    registry = Pubkey.find_program_address([b"tcap:asset-registry:v1"], Pubkey.from_string(node.TCAP_PROGRAM_ID))[0]
    if (len(config) < 244 or config[:8] != hashlib.sha256(b"account:TcapGlobalConfigV1").digest()[:8]
        or config[8:12] != b"\x01\x00\x01\x00" or config[78:110] != bytes(registry)
        or config[243] != Pubkey.find_program_address([b"tcap:global-config:v1"], Pubkey.from_string(node.TCAP_PROGRAM_ID))[1]
        or config[207] != 0 or config[142:174] != bytes(Pubkey.from_string(node.TSN_PROGRAM_ID))
        or config[208:240] != bytes(Pubkey.from_string(root_address))):
        raise ValueError("TIN_DEBIT_CONFIG_INVALID")
    if (len(entry) < 287 or entry[:8] != hashlib.sha256(b"account:TcapAssetEntryV1").digest()[:8]
        or entry[8:12] != b"\x01\x00\x01\x00" or entry[12:44] != bytes(registry)
        or entry[48:80] != bytes(Pubkey.from_string(asset["tokenProgram"]))
        or entry[80:112] != bytes(Pubkey.from_string(mint))
        or entry[244] != asset["decimals"]
        or entry[286] != Pubkey.find_program_address([b"tcap:asset-entry:v1", bytes(registry), bytes(Pubkey.from_string(asset["tokenProgram"])), bytes(Pubkey.from_string(mint))], Pubkey.from_string(node.TCAP_PROGRAM_ID))[1]
        or entry[283:286] != b"\x01\x01\x00" or entry[247] != 0
        or entry[148:180] != bytes(Pubkey.from_string(accounts["reserveState"]))
        or int.from_bytes(entry[44:48], "little") != asset["tokenId"]):
        raise ValueError("TIN_DEBIT_ASSET_INVALID")
    if (len(reserve) != 201 or reserve[:8] != hashlib.sha256(b"account:TcapReserveStateV1").digest()[:8]
        or reserve[8:12] != b"\x01\x00\x01\x00"
        or reserve[44:76] != bytes(Pubkey.from_string(asset["assetEntry"])) or reserve[189] != 0
        or reserve[190] != Pubkey.find_program_address([b"tcap:reserve-state:v1", bytes(Pubkey.from_string(asset["assetEntry"]))], Pubkey.from_string(node.TCAP_PROGRAM_ID))[1]):
        raise ValueError("TIN_DEBIT_RESERVE_INVALID")
    categories = ("actualAssets", "pendingLiabilities", "settledConfidentialLiabilities", "authorizedWithdrawalLiabilities", "reservedRefundLiabilities", "transferPending")
    balances = dict(zip(categories, (int.from_bytes(reserve[offset:offset + 8], "little") for offset in (140, 148, 156, 164, 172, 193))))
    if sum(balances[name] for name in categories[1:]) > balances["actualAssets"]:
        raise ValueError("TIN_DEBIT_RESERVE_INSOLVENT")
    tip_bump = Pubkey.find_program_address([b"tip:route-merkle-root:v1"], Pubkey.from_string(node.TINS_PROGRAM_ID))[1]
    if len(tip) < 42 or tip[0] != 1 or tip[1] != tip_bump or not 0 < int.from_bytes(tip[2:34], "big") < FIELD:
        raise ValueError("TIN_DEBIT_TIP_ROOT_INVALID")
    bump = Pubkey.find_program_address([b"gpru:tin-debit-verifier:v1"], Pubkey.from_string(node.GPRU_PROGRAM_ID))[1]
    if (len(verifier) != 2284 or verifier[:8] != hashlib.sha256(b"account:GpruTinDebitVerifierV1").digest()[:8]
        or verifier[8:10] != b"\x01\x00" or verifier[106] != bump or verifier[107] != 1):
        raise ValueError("TIN_DEBIT_VERIFIER_UNAVAILABLE")
    slot = int((result.get("context") or {}).get("slot") or 0)
    if slot <= 0 or slot < minimum_slot or sequence >= (1 << 64) - 1:
        raise ValueError("TIN_DEBIT_ROOT_CONTEXT_INVALID")
    return {"accounts": accounts, "asset": asset, "oldRoot": old_root.hex(), "rootSequence": sequence,
            "tipRoot": tip[2:34].hex(), "slot": slot, "verifier": verifier, "verifierBump": bump,
            "reserve": {"assetId": asset["tokenId"], **balances}, "deploymentCommitment": debit_deployment(accounts)}
