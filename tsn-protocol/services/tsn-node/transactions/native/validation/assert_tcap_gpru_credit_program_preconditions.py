"""_assert_tcap_gpru_credit_program_preconditions: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from funding_snapshot_sync import FUNDING_ROOT_INVALID
from typing import Any
import base64
import binascii
import hashlib
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TCAP_PROGRAM_ID: Any
    TSN_PROGRAM_ID: Any
    _read_tcap_shared_replay_root: Callable[..., Any]
    _tcap_credit_bytes32: Callable[..., Any]
    funding_root_address: Callable[..., Any]
    read_funding_root: Callable[..., Any]
    select_funding_root: Callable[..., Any]
    solana_rpc: Callable[..., Any]


async def _assert_tcap_gpru_credit_program_preconditions(node: Dependencies, transition: dict[str, Any]) -> None:
    """Check TCAP config, shared replay root and asset accounts before authorization."""
    accounts = transition.get("depositAccounts")
    accounts = accounts if isinstance(accounts, dict) else {}
    config_address = str(transition.get("tcapConfig") or accounts.get("config") or "")
    asset_entry_address = str(transition.get("assetEntry") or accounts.get("assetEntry") or "")
    if not config_address or not asset_entry_address:
        raise ValueError("TCAP config and asset entry addresses are required")

    tcap_program = Pubkey.from_string(node.TCAP_PROGRAM_ID)
    tsn_program = Pubkey.from_string(node.TSN_PROGRAM_ID)
    canonical_config, _ = Pubkey.find_program_address([b"tcap:global-config:v1"], tcap_program)
    if config_address != str(canonical_config):
        raise ValueError("TCAP config address is not the canonical program PDA")
    root_address, expected_root, expected_root_sequence = await node._read_tcap_shared_replay_root()
    if str(transition.get("commitmentRoot") or "") != root_address:
        raise ValueError("TCAP shared replay root address is not canonical")
    if node._tcap_credit_bytes32(transition.get("previousTcapRoot"), "previousTcapRoot") != expected_root:
        raise ValueError("TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT")
    if int(str(transition.get("tcapRootSequence") or "0")) != expected_root_sequence + 1:
        raise ValueError("TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT")
    funding_state = await node.read_funding_root(node.solana_rpc, node.TCAP_PROGRAM_ID)
    if (transition.get("fundingRootAccount") != str(node.funding_root_address(node.TCAP_PROGRAM_ID)[0])
            or funding_state["address"] != transition["fundingRootAccount"] or funding_state["count"] == 0):
        raise ValueError(FUNDING_ROOT_INVALID)
    node.select_funding_root(funding_state, transition["proof"]["publicInputs"][12])
    reserve_address = str(transition.get("reserveState") or "")
    if not reserve_address:
        raise ValueError("TCAP reserve state address is required")
    addresses = [config_address, root_address, asset_entry_address, reserve_address]
    response = await node.solana_rpc(
        "getMultipleAccounts", [addresses, {"encoding": "base64", "commitment": "confirmed"}],
    )
    values = ((response.get("result") or {}).get("value"))
    if not isinstance(values, list) or len(values) != len(addresses):
        raise ValueError("TCAP preflight RPC returned an incomplete account set")
    slot = int(((response.get("result") or {}).get("context") or {}).get("slot") or 0)
    if not int(str(transition.get("validAfterSlot") or "0")) <= slot <= int(str(transition.get("expiresAtSlot") or "0")):
        raise ValueError("TCAP credit authorization is outside the deployed program's slot validity window")

    decoded: list[tuple[str, bytes] | None] = []
    for address, account in zip(addresses, values):
        if account is None:
            decoded.append(None)
            continue
        if str(account.get("owner") or "") != node.TCAP_PROGRAM_ID:
            raise ValueError(f"TCAP preflight account has the wrong owner: {address}")
        encoded = (account.get("data") or [None])[0]
        if not isinstance(encoded, str):
            raise ValueError(f"TCAP preflight account has invalid data: {address}")
        try:
            decoded.append((str(account.get("owner")), base64.b64decode(encoded, validate=True)))
        except (ValueError, binascii.Error) as exc:
            raise ValueError(f"TCAP preflight account data is not valid base64: {address}") from exc

    config_record, root_record, asset_record, reserve_record = decoded
    if config_record is None or root_record is None or asset_record is None or reserve_record is None:
        raise ValueError("TCAP config, shared replay root, asset entry, or reserve is missing")
    config_data = config_record[1]
    if len(config_data) < 244 or config_data[:8] != hashlib.sha256(b"account:TcapGlobalConfigV1").digest()[:8]:
        raise ValueError("TCAP global config has an unsupported account layout")
    if config_data[207] != 0 or config_data[142:174] != bytes(tsn_program):
        raise ValueError("TCAP is paused or does not approve the configured TSN program")
    if int.from_bytes(config_data[8:10], "little") != 1 or config_data[208:240] != bytes(Pubkey.from_string(root_address)):
        raise ValueError("TCAP config version or shared-root binding is invalid")
    root_data = root_record[1]
    if len(root_data) != 124 or root_data[:8] != hashlib.sha256(b"account:TcapCommitmentRootStateV1").digest()[:8]:
        raise ValueError("TCAP shared replay root account layout is invalid")
    if int.from_bytes(root_data[8:10], "little") != 1 or root_data[122] != 0:
        raise ValueError("TCAP shared replay root is unsupported or paused")
    if (
        root_data[12:44] != node._tcap_credit_bytes32(transition.get("previousTcapRoot"), "previousTcapRoot")
        or int.from_bytes(root_data[80:88], "little") + 1 != int(str(transition.get("tcapRootSequence") or "0"))
    ):
        raise ValueError("TCAP shared replay root differs from the authorized predecessor or sequence")
    asset_data = asset_record[1]
    if len(asset_data) < 287 or asset_data[:8] != hashlib.sha256(b"account:TcapAssetEntryV1").digest()[:8]:
        raise ValueError("TCAP asset entry has an unsupported account layout")
    if int.from_bytes(asset_data[44:48], "little") != int(transition.get("tokenId") or 0):
        raise ValueError("TCAP asset entry token ID differs from the authorized transition")
    # TcapAssetEntryV1 places status/risk/deprecated after governance_approval.
    # CreditGpruMemoV1 requires Active, Approved, !paused and !deprecated;
    # withdrawal enablement and transfer policies are not credit predicates.
    if (asset_data[283] != 1 or asset_data[284] != 1 or asset_data[247] != 0 or asset_data[285] != 0
            or asset_data[148:180] != bytes(Pubkey.from_string(reserve_address))):
        raise ValueError("TCAP settlement asset is unavailable or its reserve binding is invalid")
    reserve_data = reserve_record[1]
    if (len(reserve_data) != 201 or reserve_data[:8] != hashlib.sha256(b"account:TcapReserveStateV1").digest()[:8]
            or reserve_data[44:76] != bytes(Pubkey.from_string(asset_entry_address)) or reserve_data[189] != 0):
        raise ValueError("TCAP settlement reserve layout, asset binding, or pause state is invalid")
    actual, pending, settled, withdrawal, refund = (int.from_bytes(reserve_data[offset:offset + 8], "little") for offset in (140, 148, 156, 164, 172))
    transfer_pending = int.from_bytes(reserve_data[193:201], "little")
    liabilities = pending + settled + withdrawal + refund + transfer_pending
    epoch_number = int.from_bytes(reserve_data[180:188], "little")
    epoch_address = Pubkey.find_program_address([b"tcap:credit-epoch:v1", bytes(Pubkey.from_string(asset_entry_address)), epoch_number.to_bytes(8, "little")], tcap_program)[0]
    if transition.get("accountingEpoch") != str(epoch_address):
        raise ValueError("TCAP_CREDIT_EPOCH_CHANGED_BEFORE_SETTLEMENT")
    if liabilities > 0xFFFFFFFFFFFFFFFF or actual < liabilities:
        raise ValueError("TCAP settlement reserve lacks funded pending liabilities or is insolvent")
