"""epoch_credits implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
import base64
import hashlib

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
