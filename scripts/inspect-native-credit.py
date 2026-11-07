"""Read finalized native-credit bytes, record a public baseline, optionally compare another capture.

Only getTransaction/getAccountInfo RPC calls are made. No Receiver access, witnesses, private
keys, signing, decryption, work transitions or submissions are used.
"""
import argparse
import base64
import hashlib
import json
import os
import struct
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import dotenv_values
from solders.pubkey import Pubkey

ROOT = Path(__file__).resolve().parents[1]
Q = 21888242871839275222246405745257275088548364400416034343698204186575808495617
ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
TSNP = "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V"
TCAP = "tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF"
GPRU = "6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR"
MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
SIGNALS = ["oldGlobalRoot", "newGlobalRoot", "memoCommitment", "actionCommitment", "nullifier", "tipRouteRoot",
           "successorPortfolioRoot", "successorBalanceX", "successorBalanceY", "encryptedBlindingDelta", "deltaEphemeralPublicX", "deltaEphemeralPublicY"]
ACCOUNT_ROLES = ["motherAuthority", "motherEscrow", "tcapProgram", "tsnpProgram", "tcapConfig", "assetEntry", "commitmentRoot",
                 "reserveState", "authorizationSigner", "tipRouteRoot", "gpruVerifier", "instructionsSysvar", "gpruProgram"]


def decode58(value):
    number = 0
    for ch in value:
        if ch not in ALPHABET:
            raise ValueError("Invalid public Base58 value")
        number = number * 58 + ALPHABET.index(ch)
    return b"\0" * (len(value) - len(value.lstrip("1"))) + (number.to_bytes((number.bit_length() + 7) // 8, "big") if number else b"")


def encode58(value):
    number, out = int.from_bytes(value, "big"), ""
    while number:
        number, remainder = divmod(number, 58)
        out = ALPHABET[remainder] + out
    return "1" * (len(value) - len(value.lstrip(b"\0"))) + out


def digest(value):
    return hashlib.sha256(value).hexdigest()


def scalar_hash(value):
    return f"{int(digest(value), 16) % Q:064x}"


def decode_proof(data, start):
    fields, offsets = {}, {}
    cursor = start
    for name in SIGNALS:
        fields[name] = data[cursor:cursor + 32].hex()
        offsets[name] = [cursor, cursor + 32]
        cursor += 32
    for name, size in [("proofA", 64), ("proofB", 128), ("proofC", 64)]:
        fields[name] = data[cursor:cursor + size].hex(); offsets[name] = [cursor, cursor + size]; cursor += size
    for name, size in [("actionKind", 1), ("tokenId", 4), ("amountBaseUnits", 8)]:
        fields[name] = int.from_bytes(data[cursor:cursor + size], "little"); offsets[name] = [cursor, cursor + size]; cursor += size
    fields["authorizationCommitment"] = data[cursor:cursor + 32].hex(); offsets["authorizationCommitment"] = [cursor, cursor + 32]; cursor += 32
    if cursor != len(data):
        raise ValueError("Unsupported or truncated hidden-head proof layout")
    return fields, offsets


def decode_credit(data, tcap=False):
    name = "credit_gpru_memo_v1" if tcap else "tsn_register_tcap_credit_authorization_v2"
    if len(data) != 825 or data[:8] != hashlib.sha256(f"global:{name}".encode()).digest()[:8]:
        raise ValueError("Not the current 825-byte native-credit ABI")
    fields = {"discriminator": data[:8].hex()}; offsets = {"discriminator": [0, 8]}; cursor = 8
    layout = [("authorizationDigest", 32, "hex"), ("validAfterSlot", 8, "le"), ("expiresAtSlot", 8, "le"),
              ("previousTcapRoot", 32, "hex"), ("tcapRootSequence", 8, "le"), ("tokenId", 4, "le")]
    layout += [("nullifier", 32, "hex"), ("amountBaseUnits", 8, "le")] if tcap else [("amountBaseUnits", 8, "le"), ("nullifier", 32, "hex")]
    for key, size, encoding in layout:
        part = data[cursor:cursor + size]; fields[key] = part.hex() if encoding == "hex" else int.from_bytes(part, "little")
        offsets[key] = [cursor, cursor + size]; cursor += size
    fields["proof"], offsets["proof"] = decode_proof(data, cursor)
    return name, fields, offsets


def parse_wire(wire):
    if len(wire) > 4096 or len(wire) < 42 or wire[0] != 0x81:
        raise ValueError("Not a supported Solana V1 wire")
    required, readonly_signed, readonly_unsigned = wire[1:4]
    mask, = struct.unpack_from("<I", wire, 4)
    if required != 2 or mask != 12:
        raise ValueError("Unsupported native-credit signature/config layout")
    message = wire[:-required * 64]
    count, address_count = message[40:42]; cursor = 42
    keys = [encode58(message[cursor + i * 32:cursor + (i + 1) * 32]) for i in range(address_count)]; cursor += 32 * address_count
    compute_limit, loaded_limit = struct.unpack_from("<II", message, cursor); cursor += 8
    headers = []
    for _ in range(count):
        headers.append((message[cursor], message[cursor + 1], int.from_bytes(message[cursor + 2:cursor + 4], "little"))); cursor += 4
    instructions = []
    for program, key_count, size in headers:
        indexes = list(message[cursor:cursor + key_count]); cursor += key_count; data_start = cursor
        data = message[cursor:cursor + size]; cursor += size
        if program >= len(keys) or any(i >= len(keys) for i in indexes) or len(data) != size:
            raise ValueError("Invalid instruction address/size")
        instructions.append({"program": keys[program], "accountIndexes": indexes, "data": data, "dataWireRange": [data_start, cursor]})
    if cursor != len(message) or count != 2 or instructions[0]["program"] != TSNP or instructions[1]["program"] != MEMO:
        raise ValueError("Not the canonical two-instruction native credit")
    addresses = [{"index": i, "address": key, "isSigner": i < required,
                  "isWritable": i < required - readonly_signed if i < required else i < len(keys) - readonly_unsigned,
                  "wireRange": [42 + i * 32, 74 + i * 32]} for i, key in enumerate(keys)]
    envelope = {"versionMarker": "81", "version": 1, "requiredSignatures": required,
                "readonlySigned": readonly_signed, "readonlyUnsigned": readonly_unsigned, "configMask": mask,
                "recentBlockhash": encode58(message[8:40]), "instructionCount": count, "addressCount": address_count,
                "computeUnitLimit": compute_limit, "loadedAccountBytesLimit": loaded_limit,
                "messageBytes": len(message), "wireBytes": len(wire), "wireSha256": digest(wire),
                "signatures": [{"index": i, "signer": keys[i], "signature": encode58(wire[len(message) + i * 64:len(message) + (i + 1) * 64]),
                                "wireRange": [len(message) + i * 64, len(message) + (i + 1) * 64]} for i in range(required)]}
    return envelope, addresses, instructions


def capture(rpc, signature, funding_signature=None):
    tx = rpc("getTransaction", [signature, {"encoding": "base64", "commitment": "finalized", "maxSupportedTransactionVersion": 1}])
    if not tx or tx.get("meta", {}).get("err") is not None or tx.get("version") != 1:
        raise ValueError("Credit has no successful finalized V1 receipt")
    wire = base64.b64decode(tx["transaction"][0], validate=True)
    envelope, addresses, instructions = parse_wire(wire)
    if envelope["signatures"][0]["signature"] != signature:
        raise ValueError("Signature does not match the captured V1 wire")
    name, fields, offsets = decode_credit(instructions[0]["data"])
    role_map = dict(zip(ACCOUNT_ROLES, [addresses[i]["address"] for i in instructions[0]["accountIndexes"]]))
    if len(instructions[0]["accountIndexes"]) != 13:
        raise ValueError("Native credit has an unexpected account layout")
    for a in addresses:
        a["roles"] = (["crankerFeePayer"] if a["index"] == 0 else []) + [role for role, key in role_map.items() if key == a["address"]]
        if a["address"] == MEMO: a["roles"].append("memoProgram")
        a["lamportsBefore"] = tx["meta"]["preBalances"][a["index"]]; a["lamportsAfter"] = tx["meta"]["postBalances"][a["index"]]
    memo = instructions[1]["data"].decode("ascii"); parts = memo.split(":", 8)
    if len(parts) != 9 or parts[0] != "TSN_GPRU_HEAD_V1":
        raise ValueError("Unsupported Memo format")
    document = json.loads(base64.urlsafe_b64decode(parts[8] + "=" * (-len(parts[8]) % 4)))
    ciphertext = base64.b64decode(document["data"], validate=True); nonce = base64.b64decode(document["nonce"], validate=True)
    doc_summary = {k: v for k, v in document.items() if k not in ("data", "nonce")}
    doc_summary.update({"data": {"ciphertextBytes": len(ciphertext), "sha256": digest(ciphertext)},
                        "nonce": {"bytes": len(nonce), "hex": nonce.hex()}})
    prefix_names = ["successorPortfolioRoot", "successorBalanceX", "successorBalanceY", "actionCommitment", "encryptedBlindingDelta", "deltaEphemeralPublicX", "deltaEphemeralPublicY"]
    prefix = dict(zip(prefix_names, parts[1:8])); proof = fields["proof"]
    checks = {"memoPublicFieldsMatchProof": all(prefix[k] == proof[k] for k in prefix_names),
              "memoScalarHashMatchesProof": scalar_hash(memo.encode()) == proof["memoCommitment"],
              "oldRootMatchesArgument": proof["oldGlobalRoot"] == fields["previousTcapRoot"],
              "nullifierMatchesArgument": proof["nullifier"] == fields["nullifier"],
              "proofAmountMatchesArgument": proof["amountBaseUnits"] == fields["amountBaseUnits"],
              "proofTokenMatchesArgument": proof["tokenId"] == fields["tokenId"],
              "authorizationScalarMatchesDigest": f"{int(fields['authorizationDigest'],16) % Q:064x}" == proof["authorizationCommitment"]}
    auth_preimage = (b"TSN_GPRU_TCAP_CREDIT_HIDDEN_HEAD_V1\0" + decode58(role_map["commitmentRoot"]) + bytes.fromhex(fields["previousTcapRoot"])
                    + struct.pack("<QQQQI", fields["tcapRootSequence"], fields["validAfterSlot"], fields["expiresAtSlot"], fields["amountBaseUnits"], fields["tokenId"])
                    + bytes.fromhex(fields["nullifier"]))
    checks["publicAuthorizationDigestRecomputed"] = digest(auth_preimage) == fields["authorizationDigest"]
    asset_response = rpc("getAccountInfo", [role_map["assetEntry"], {"encoding": "base64", "commitment": "finalized"}])
    asset_value = asset_response.get("value") or {}; asset_data = base64.b64decode((asset_value.get("data") or [""])[0], validate=True)
    if asset_value.get("owner") != TCAP or len(asset_data) < 287 or asset_data[:8] != hashlib.sha256(b"account:TcapAssetEntryV1").digest()[:8]:
        raise ValueError("Asset registry binding is unavailable")
    asset = {"observedContextSlot": asset_response["context"]["slot"], "registry": encode58(asset_data[12:44]),
             "tokenId": int.from_bytes(asset_data[44:48], "little"), "tokenProgram": encode58(asset_data[48:80]),
             "mint": encode58(asset_data[80:112]), "domainId": int.from_bytes(asset_data[112:116], "little"),
             "scope": asset_data[116:148].hex(), "reserveState": encode58(asset_data[148:180]), "decimals": asset_data[244]}
    checks["assetTokenAndReserveMatch"] = asset["tokenId"] == fields["tokenId"] and asset["reserveState"] == role_map["reserveState"]
    derivations = {}
    seeds = {"motherEscrow": (TSNP, [b"tsn_mother_escrow"]), "tcapConfig": (TCAP, [b"tcap:global-config:v1"]),
             "commitmentRoot": (TCAP, [b"tcap:commitment-root:v1"]), "tipRouteRoot": ("TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT", [b"tip:route-merkle-root:v1"]),
             "gpruVerifier": (GPRU, [b"gpru:hidden-head-verifier:v1"]), "authorizationSigner": (TSNP, [b"tsn:tcap-authorization:v1", bytes.fromhex(fields["authorizationDigest"])]),
             "reserveState": (TCAP, [b"tcap:reserve-state:v1", decode58(role_map["assetEntry"])]),
             "assetEntry": (TCAP, [b"tcap:asset-entry:v1", decode58(asset["registry"]), decode58(asset["tokenProgram"]), decode58(asset["mint"])])}
    for role, (program, components) in seeds.items():
        address, bump = Pubkey.find_program_address(components, Pubkey.from_string(program))
        checks[f"pdaMatches:{role}"] = str(address) == role_map[role]
        derivations[role] = {"program": program, "seedBytesHex": [seed.hex() for seed in components], "bump": bump, "address": str(address)}
    inner = []
    for group in tx["meta"].get("innerInstructions") or []:
        for item in group["instructions"]:
            data = decode58(item["data"]); program = addresses[item["programIdIndex"]]["address"]
            if program == TCAP:
                inner_name, decoded, inner_offsets = decode_credit(data, tcap=True)
                checks["tcapCpiFieldsMatchTsnp"] = all(decoded[k] == fields[k] for k in fields if k != "discriminator")
            elif program == GPRU:
                inner_name = "verify_hidden_head_transition_v1"
                if data[:8] != hashlib.sha256(f"global:{inner_name}".encode()).digest()[:8]: raise ValueError("Unexpected GPRU discriminator")
                decoded, inner_offsets = decode_proof(data, 8); checks["gpruCpiProofMatchesTsnp"] = decoded == proof
            else:
                raise ValueError("Unexpected native-credit CPI")
            inner.append({"parentTopLevelInstruction": group["index"], "stackHeight": item.get("stackHeight"), "program": program,
                          "name": inner_name, "accountIndexes": item["accounts"], "dataBytes": len(data), "fields": decoded, "byteRanges": inner_offsets})
    funding = None
    if funding_signature:
        receipt = rpc("getTransaction", [funding_signature, {"encoding": "json", "commitment": "finalized", "maxSupportedTransactionVersion": 1}])
        if not receipt or receipt.get("meta", {}).get("err") is not None:
            raise ValueError("Funding has no successful finalized receipt")
        recomputed = scalar_hash(b"TSN_GPRU_CONFIRMED_DEPOSIT_NULLIFIER_V1\0" + decode58(TCAP) + decode58(funding_signature))
        checks["publicDepositNullifierLinkRecomputed"] = recomputed == fields["nullifier"]
        funding = {"signature": funding_signature, "slot": receipt["slot"], "nullifierRecomputed": recomputed,
                   "feePayer": receipt["transaction"]["message"]["accountKeys"][0]}
    events = []
    for line in tx["meta"].get("logMessages") or []:
        if not line.startswith("Program data: "): continue
        data = base64.b64decode(line.removeprefix("Program data: "), validate=True)
        if len(data) != 116 or data[:8] != hashlib.sha256(b"event:TcapGpruMemoCreditedV1").digest()[:8]:
            raise ValueError("Unexpected native-credit event")
        event = {"name": "TcapGpruMemoCreditedV1", "discriminator": data[:8].hex(), "previousRoot": data[8:40].hex(),
                 "currentRoot": data[40:72].hex(), "settlementSequence": int.from_bytes(data[72:80], "little"),
                 "tokenId": int.from_bytes(data[80:84], "little"), "transitionDigest": data[84:116].hex(), "dataBytes": len(data)}
        transition_digest = digest(b"TCAP_GPRU_MEMO_CREDIT_V1\0" + bytes.fromhex(fields["previousTcapRoot"])
                                  + bytes.fromhex(proof["newGlobalRoot"]) + bytes.fromhex(fields["authorizationDigest"])
                                  + bytes.fromhex(fields["nullifier"]) + struct.pack("<IQ", fields["tokenId"], fields["amountBaseUnits"])
                                  + bytes.fromhex(proof["memoCommitment"]))
        checks["eventMatchesCreditTransition"] = (event["previousRoot"] == proof["oldGlobalRoot"] and event["currentRoot"] == proof["newGlobalRoot"]
                                                 and event["settlementSequence"] == fields["tcapRootSequence"] and event["tokenId"] == fields["tokenId"]
                                                 and event["transitionDigest"] == transition_digest)
        events.append(event)
    if not all(checks.values()):
        raise ValueError("Public ABI/commitment relationship check failed")
    return {"schema": "TSN_PUBLIC_NATIVE_CREDIT_CAPTURE_V1", "capturedAtUtc": datetime.now(timezone.utc).isoformat(),
            "clusterScope": "caller-configured RPC; baseline observed on Devnet", "signature": signature, "slot": tx["slot"],
            "blockTimeUtc": datetime.fromtimestamp(tx["blockTime"], timezone.utc).isoformat(), "finality": "finalized",
            "meta": {k: tx["meta"].get(k) for k in ["err", "fee", "computeUnitsConsumed", "costUnits", "preTokenBalances", "postTokenBalances", "rewards", "loadedAddresses"]},
            "envelope": envelope, "accounts": addresses,
            "creditInstruction": {"name": name, "program": TSNP, "accountRoles": role_map, "accountIndexes": instructions[0]["accountIndexes"],
                                  "dataBytes": len(instructions[0]["data"]), "wireRange": instructions[0]["dataWireRange"], "fields": fields, "byteRanges": offsets},
            "memo": {"program": MEMO, "accountIndexes": instructions[1]["accountIndexes"], "wireRange": instructions[1]["dataWireRange"],
                     "bytes": len(memo), "sha256": digest(memo.encode()), "prefix": parts[0], "publicFields": prefix,
                     "bodyBase64UrlBytes": len(parts[8]), "decodedDocumentBytes": len(base64.urlsafe_b64decode(parts[8]+"="*(-len(parts[8])%4))), "document": doc_summary},
            "innerInstructions": inner, "events": events,
            "executionLogs": [line for line in tx["meta"].get("logMessages") or [] if not line.startswith("Program log: Memo") and not line.startswith("Program data: ")],
            "funding": funding, "assetObservation": asset, "accountDerivations": derivations, "checks": checks,
            "privacyScope": "Public chain capture only; no recipient witness, plaintext action record, secret or raw ciphertext persisted"}


def comparison(before, after):
    entries = []
    def walk(a, b, path):
        if isinstance(a, dict) and isinstance(b, dict):
            for key in sorted(set(a) | set(b)): walk(a.get(key), b.get(key), f"{path}.{key}" if path else key)
        elif isinstance(a, list) and isinstance(b, list):
            for i in range(max(len(a), len(b))): walk(a[i] if i < len(a) else None, b[i] if i < len(b) else None, f"{path}[{i}]")
        else: entries.append({"path": path, "before": a, "after": b, "same": a == b})
    walk(before, after, "")
    cross_field = []
    old_values, new_values = {}, {}
    for entry in entries:
        for value, bucket in [(entry["before"], old_values), (entry["after"], new_values)]:
            if not isinstance(value, str): continue
            meaningful = (len(value) >= 32 and all(ch in "0123456789abcdef" for ch in value)) or (32 <= len(value) <= 88 and all(ch in ALPHABET for ch in value))
            if meaningful: bucket.setdefault(value, []).append(entry["path"])
    for value in sorted(set(old_values) & set(new_values)):
        cross_field.append({"value": value, "baselinePaths": old_values[value], "newPaths": new_values[value]})
    return {"baselineSignature": before["signature"], "newSignature": after["signature"], "entries": entries,
            "crossFieldRecurrences": cross_field,
            "oldNewGlobalRootContinuity": before["creditInstruction"]["fields"]["proof"]["newGlobalRoot"] == after["creditInstruction"]["fields"]["proof"]["oldGlobalRoot"],
            "interpretation": "Equality/difference is an observation, not a proof of recipient unlinkability; analyze public derivations and shared-state continuity"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--signature", required=True); parser.add_argument("--funding-signature")
    parser.add_argument("--out", required=True, type=Path); parser.add_argument("--compare", type=Path)
    args = parser.parse_args()
    if args.out.exists(): raise ValueError("Output already exists; preserve the original capture and choose another path")
    config = {}
    for name in (".env", ".env.local"):
        config.update({k: v for k, v in dotenv_values(ROOT / "tsn-protocol/services/tsn-node" / name).items() if v is not None})
    config.update(os.environ)
    url = str(config.get("TSN_RPC_URL") or config.get("TSN_RPC_GATEWAY_URL") or "http://127.0.0.1:8787").strip().strip("\"'")
    with httpx.Client(timeout=30) as client:
        def rpc(method, params):
            response = client.post(url, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
            if response.status_code != 200: raise ValueError("Read-only RPC request failed")
            body = response.json()
            if body.get("error"): raise ValueError("Read-only RPC could not return the requested finalized transaction")
            return body.get("result")
        result = capture(rpc, args.signature, args.funding_signature)
    if args.compare:
        baseline = json.loads(args.compare.read_text(encoding="utf-8"))
        if baseline.get("schema") != result["schema"]: raise ValueError("Incompatible baseline schema")
        result["comparison"] = comparison(baseline, result)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("x", encoding="utf-8") as file: json.dump(result, file, indent=2); file.write("\n")
    print(f"Finalized native credit captured: slot={result['slot']} bytes={result['envelope']['wireBytes']} accounts={len(result['accounts'])}")
    print(f"Public relationship checks passed: {len(result['checks'])}; output={args.out}")


if __name__ == "__main__":
    try: main()
    except Exception as exc:
        print(str(exc) if isinstance(exc, ValueError) else f"Public credit inspection failed: {type(exc).__name__}")
        raise SystemExit(1)
