"""Chain-backed private-credit scheduling and complete epoch reconstruction.

Distinct source wallets are an admission measure, not proof of independent people.
Only the TCAP transcript and aggregate proof authorize liability reclassification.
"""
from __future__ import annotations
import base64, hashlib, time
from pathlib import Path
from typing import Any
from app.solana_pubkey import Pubkey
from gpru_crypto import BABYJUB_FIELD, poseidon_v1
from hidden_head_witness import hex_field
from credit_amount import read_opening
from funding_snapshot_sync import TCAP_PROGRAM, sealed_pool_address
from funding_note import funded_leaf

class PrivateCreditWait(Exception):
    def __init__(self, reason: str, seconds: int = 8):
        super().__init__(reason)
        self.seconds = max(1, min(60, seconds))


def schedule(arrival_slots: list[int], slot: int) -> tuple[int, int]:
    """Use shared slot windows: low traffic carries forward; busy pools release faster."""
    recent = sum(slot - 150 <= value <= slot for value in arrival_slots)
    target = max(2, min(8, 2 + recent // 8))
    window = 24 if recent >= 16 else 48 if recent >= 4 else 96
    return target, window


def qualified_sources(rows: list[dict], consumed: set[str]) -> list[dict]:
    notes, nullifiers, result = set(), set(), []
    for row in rows:
        if (type(row.get("amount")) is not int or row["amount"] <= 0 or not row.get("wallet")
            or row["nullifier"] in consumed or row["commitment"] in notes or row["nullifier"] in nullifiers):
            continue
        notes.add(row["commitment"]); nullifiers.add(row["nullifier"]); result.append(row)
    return result


def admitted_pool_sources(rows: list[dict], snapshot: dict) -> list[dict]:
    """Count only positive, unconsumed notes inside the exact captured tree."""
    leaves = set(snapshot["leaves"])
    return [row for row in qualified_sources(rows, set())
            if funded_leaf(row["commitment"], row["token"], row["amount"]) in leaves]


async def read_epoch(rpc, asset: str, reserve: str) -> dict:
    response = await rpc("getAccountInfo", [reserve, {"encoding": "base64", "commitment": "confirmed"}])
    account = (response.get("result") or {}).get("value")
    if not isinstance(account, dict) or account.get("owner") != TCAP_PROGRAM:
        raise ValueError("TCAP_CREDIT_RESERVE_INVALID")
    data = base64.b64decode(account["data"][0], validate=True)
    if (len(data) != 201 or data[:8] != hashlib.sha256(b"account:TcapReserveStateV1").digest()[:8]
        or data[44:76] != bytes(Pubkey.from_string(asset)) or data[189] != 0):
        raise ValueError("TCAP_CREDIT_RESERVE_INVALID")
    number = int.from_bytes(data[180:188], "little")
    address, bump = Pubkey.find_program_address([b"tcap:credit-epoch:v1", bytes(Pubkey.from_string(asset)), number.to_bytes(8, "little")], Pubkey.from_string(TCAP_PROGRAM))
    response = await rpc("getAccountInfo", [str(address), {"encoding": "base64", "commitment": "confirmed"}])
    account = (response.get("result") or {}).get("value")
    seed = hex_field(int.from_bytes(hashlib.sha256(b"TSN_TCAP_CREDIT_EPOCH_V1\0" + bytes(address)).digest(), "big") % BABYJUB_FIELD)
    result = {"address": str(address), "asset": asset, "number": number, "seed": seed, "digest": seed, "count": 0, "started": 0}
    if account is None:
        return result
    if account.get("owner") != TCAP_PROGRAM:
        raise ValueError("TCAP_CREDIT_EPOCH_INVALID")
    data = base64.b64decode(account["data"][0], validate=True)
    if (len(data) != 136 or data[:8] != hashlib.sha256(b"account:TcapCreditEpochV1").digest()[:8]
        or data[8:10] != b"\x01\x00" or data[10] != bump or data[11:43] != bytes(Pubkey.from_string(asset))
        or int.from_bytes(data[43:51], "little") != number or data[55:87].hex() != seed or data[135] != 0):
        raise ValueError("TCAP_CREDIT_EPOCH_INVALID")
    result.update(token=int.from_bytes(data[51:55], "little"), digest=data[87:119].hex(), count=int.from_bytes(data[119:127], "little"), started=int.from_bytes(data[127:135], "little"))
    if not 0 <= result["count"] <= 64 or int(result["digest"], 16) >= BABYJUB_FIELD:
        raise ValueError("TCAP_CREDIT_EPOCH_INVALID")
    return result


def build_epoch_witness(epoch: dict, credits: list[dict], directory: Path) -> dict:
    if not 2 <= epoch["count"] <= 64 or len(credits) != epoch["count"]:
        raise PrivateCreditWait("TCAP_EPOCH_REQUIRES_COMPLETE_GROUP")
    ordered = sorted(credits, key=lambda row: row["sequence"])
    if len({row["sequence"] for row in ordered}) != len(ordered) or len({row["nullifier"] for row in ordered}) != len(ordered):
        raise ValueError("TCAP_EPOCH_DUPLICATE_TRANSITION")
    amounts, blindings, nullifiers = [], [], []
    digest = int(epoch["seed"], 16)
    for row in ordered:
        opening = read_opening(directory, row["amountCommitment"])
        if (opening["tokenId"] != epoch["token"] or opening["nullifier"] != row["nullifier"]
            or row["epoch"] != epoch["address"]):
            raise ValueError("TCAP_EPOCH_OPENING_BINDING_MISMATCH")
        amounts.append(int(opening["amount"])); blindings.append(int(opening["blinding"])); nullifiers.append(int(row["nullifier"], 16))
        digest = poseidon_v1([digest, int(row["amountCommitment"],16), nullifiers[-1]])
    if hex_field(digest) != epoch["digest"] or sum(amounts) > 0xffffffffffffffff:
        raise ValueError("TCAP_EPOCH_TRANSCRIPT_MISMATCH")
    return {"seed": int(epoch["seed"],16), "digest": digest, "total": sum(amounts), "count": len(ordered), "tokenId": epoch["token"],
            "amounts": amounts + [0]*(64-len(ordered)), "blindings": blindings + [0]*(64-len(ordered)), "nullifiers": nullifiers + [0]*(64-len(ordered))}


async def epoch_credits(rpc, epoch: dict, parse_message, tsnp: str) -> list[dict]:
    credits, before, scanned = [], None, 0
    disc = hashlib.sha256(b"global:tsn_register_tcap_credit_authorization_v3").digest()[:8]
    while len(credits) < epoch["count"] and scanned < 1000:
        opts = {"commitment": "confirmed", "limit": 100}
        if before: opts["before"] = before
        response = await rpc("getSignaturesForAddress", [epoch["address"], opts])
        rows = response.get("result")
        if not isinstance(rows, list) or not rows: break
        for row in rows:
            scanned += 1; before = row["signature"]
            if row.get("err") is not None: continue
            response = await rpc("getTransaction", [before, {"encoding": "base64", "commitment": "confirmed", "maxSupportedTransactionVersion": 1}])
            tx = response.get("result")
            if not tx or tx.get("meta", {}).get("err") is not None: raise ValueError("TCAP_EPOCH_HISTORY_UNAVAILABLE")
            wire = base64.b64decode(tx["transaction"][0], validate=True)
            # Canonical native v1 has two 64-byte signatures after its message.
            if wire[0] != 0x81: raise ValueError("TCAP_EPOCH_HISTORY_WIRE_UNSUPPORTED")
            required, _, _, _, _, instructions = parse_message(wire[:-128])
            if required != 2: raise ValueError("TCAP_EPOCH_HISTORY_SIGNERS_INVALID")
            for program, accounts, data in instructions:
                if program != tsnp or data[:8] != disc: continue
                if (len(data) != 905 or len(accounts) != 16 or accounts[14] != epoch["address"]
                    or accounts[5] != epoch["asset"] or int.from_bytes(data[96:100], "little") != epoch["token"]):
                    raise ValueError("TCAP_EPOCH_HISTORY_ABI_MISMATCH")
                credits.append({"sequence": int.from_bytes(data[88:96],"little"), "amountCommitment": data[100:132].hex(),
                    "nullifier": data[132:164].hex(), "epoch": accounts[14]})
            if len(credits) == epoch["count"]: break
    if len(credits) != epoch["count"]: raise ValueError("TCAP_EPOCH_HISTORY_UNAVAILABLE")
    return credits
