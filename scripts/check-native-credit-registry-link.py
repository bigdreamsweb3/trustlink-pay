"""Check first-credit recipient-registry linkage using public data only.

Reads a retained public native-credit baseline, finalized credit receipt and public
TIP registry accounts. No Receiver state, TIN plaintext, witnesses, decryption,
signing, service changes or transaction submissions are used. Outputs allowlisted
public roots, account addresses and bounded verification results only.
"""
import argparse
import base64
import hashlib
import importlib.util
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import dotenv_values
from solders.pubkey import Pubkey

ROOT = Path(__file__).resolve().parents[1]
TIP = "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT"
PUBLISHED_REGISTRY = "EZLPHfpq1qiPk5tsYUDM8CEAwavst23mJAGBeBowHFX1"
sys.path.insert(0, str(ROOT / "tsn-protocol/services/tsn-node"))
from gpru_crypto import BABYJUB_FIELD, poseidon_v1


def hex_field(value):
    return int(value).to_bytes(32, "big").hex()


def empty_ladder(depth):
    nodes = [0]
    for _ in range(depth):
        nodes.append(poseidon_v1([nodes[-1], nodes[-1]]))
    return nodes


def insert_empty(leaf, index, zeros):
    value = leaf
    for level, sibling in enumerate(zeros[:-1]):
        value = poseidon_v1([sibling, value] if (index >> level) & 1 else [value, sibling])
    return value


def registry_route_key(address, owner, data):
    """Skip public encrypted envelope bytes; retain only the public route commitment."""
    if owner != TIP or len(data) < 80 or data[0] != 1 or data[2] != 1:
        raise ValueError("UNSUPPORTED_PUBLIC_REGISTRY")
    lookup = data[8:40]
    expected = Pubkey.find_program_address([b"tin-v1", lookup], Pubkey.from_string(TIP))[0]
    if str(expected) != address:
        raise ValueError("PUBLIC_REGISTRY_PDA_MISMATCH")
    cursor = 72
    for _ in range(2):
        if cursor + 4 > len(data):
            raise ValueError("TRUNCATED_PUBLIC_REGISTRY")
        size = int.from_bytes(data[cursor:cursor + 4], "little")
        cursor += 4 + size
        if cursor > len(data):
            raise ValueError("TRUNCATED_PUBLIC_REGISTRY")
    cursor += 8 + 32
    if cursor + 8 + 32 + 1 + 1 + 32 + 32 + 1 + 32 + 32 + 32 > len(data):
        raise ValueError("TRUNCATED_PUBLIC_ROUTE_FIELDS")
    route_version = int.from_bytes(data[cursor:cursor + 8], "little")
    cursor += 8 + 32
    tip_version, key_version = data[cursor:cursor + 2]
    cursor += 2
    public_key = data[cursor:cursor + 32]
    commitment = data[cursor + 32:cursor + 64]
    cursor += 64
    scan_version = data[cursor]
    cursor += 1 + 32 + 32 + 32
    if route_version < 1 or tip_version != 1 or key_version != 1 or scan_version != 1 or any(data[cursor:]):
        raise ValueError("UNSUPPORTED_PUBLIC_ROUTE_FIELDS")
    # This matches TIP's public key-commitment validator and excludes malformed candidates.
    expected_commitment = hashlib.sha256(b"TSN_GPRU_ELGAMAL_KEY_COMMITMENT_V1\0" + bytes([key_version]) + public_key).digest()
    if commitment != expected_commitment:
        raise ValueError("PUBLIC_ROUTE_KEY_COMMITMENT_MISMATCH")
    return int.from_bytes(commitment, "big") % BABYJUB_FIELD


def sanitized_error(error):
    # HTTP errors can contain credential-bearing RPC URLs; never persist str(error).
    return type(error).__name__


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, default=ROOT / "docs/references/native-credit-baseline-20261102.json")
    parser.add_argument("--out", type=Path, default=ROOT / "docs/references/native-credit-registry-link-20261102.json")
    args = parser.parse_args()
    if args.out.exists():
        raise ValueError("OUTPUT_EXISTS_PRESERVE_EVIDENCE")
    baseline = json.loads(args.baseline.read_text(encoding="utf-8"))
    statement = baseline["creditInstruction"]["fields"]
    proof = statement["proof"]
    zeros128 = empty_ladder(128)
    zeros32 = empty_ladder(32)
    genesis = poseidon_v1([zeros128[-1], zeros128[-1]])
    public_portfolio = insert_empty(poseidon_v1([statement["tokenId"], int(proof["successorBalanceX"], 16),
                                              int(proof["successorBalanceY"], 16)]), statement["tokenId"], zeros32)
    nullifier_leaf = poseidon_v1([int(proof["nullifier"], 16)])
    new_nullifier_root = insert_empty(nullifier_leaf, nullifier_leaf, zeros128)
    result = {
        "schema": "tsn-public-native-credit-registry-link-v1",
        "checkedAtUtc": datetime.now(timezone.utc).isoformat(),
        "signature": baseline["signature"], "baselineSlot": baseline["slot"],
        "inputs": "retained public proof statement and finalized public chain accounts only",
        "scope": "first credit from verified empty shared state; recipient registry linkage, not plaintext TIN recovery",
        "checks": {
            "retainedOldRootMatchesEmptyGenesis": hex_field(genesis) == proof["oldGlobalRoot"],
            "globalSequenceIsOne": statement["tcapRootSequence"] == 1,
            "publicSingleTokenPortfolioMatches": hex_field(public_portfolio) == proof["successorPortfolioRoot"],
        },
        "roots": {"emptyGenesis": hex_field(genesis), "observedSuccessor": proof["newGlobalRoot"],
                  "newNullifierRoot": hex_field(new_nullifier_root)},
        "publicCandidates": [], "rpcChecks": {}, "rpcFailures": [],
        "limitations": ["current public registry observation is not an archival registry snapshot",
                        "single first-credit result does not validate all later transitions or reveal plaintext TIN",
                        "no secret, witness, private local payload, owner decryption or service state used"],
    }
    if not all(result["checks"].values()):
        raise ValueError("BASELINE_NOT_EMPTY_FIRST_CREDIT")

    config = {}
    for name in (".env", ".env.local"):
        config.update({k: v for k, v in dotenv_values(ROOT / "tsn-protocol/services/tsn-node" / name).items() if v is not None})
    config.update(os.environ)
    url = str(config.get("TSN_RPC_URL") or config.get("TSN_RPC_GATEWAY_URL") or "http://127.0.0.1:8787").strip().strip("\"'")
    with httpx.Client(timeout=20) as client:
        def rpc(method, params):
            response = client.post(url, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
            if response.status_code != 200:
                raise RuntimeError(f"RPC_HTTP_{response.status_code}")
            body = response.json()
            if body.get("error") or body.get("result") is None:
                raise RuntimeError("RPC_RESULT_UNAVAILABLE")
            return body["result"]

        try:
            receipt = rpc("getTransaction", [baseline["signature"], {"encoding": "base64", "commitment": "finalized", "maxSupportedTransactionVersion": 1}])
            wire = base64.b64decode(receipt["transaction"][0], validate=True)
            spec = importlib.util.spec_from_file_location("public_credit_inspector", ROOT / "scripts/inspect-native-credit.py")
            inspector = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(inspector)
            envelope, _, instructions = inspector.parse_wire(wire)
            _, live_statement, _ = inspector.decode_credit(instructions[0]["data"])
            result["rpcChecks"].update({
                "finalizedSuccessfulV1Receipt": receipt.get("version") == 1 and receipt.get("meta", {}).get("err") is None,
                "receiptSlotMatchesBaseline": receipt["slot"] == baseline["slot"],
                "wireHashMatchesBaseline": envelope["wireSha256"] == baseline["envelope"]["wireSha256"],
                "creditStatementMatchesBaseline": live_statement == statement,
            })
        except Exception as error:
            result["rpcFailures"].append({"method": "getTransaction", "errorType": sanitized_error(error)})

        candidates = []
        try:
            enumeration = rpc("getProgramAccounts", [TIP, {"encoding": "base64", "commitment": "finalized", "withContext": True,
                "filters": [{"memcmp": {"offset": 0, "bytes": "2"}}, {"memcmp": {"offset": 2, "bytes": "2"}}]}])
            candidates = enumeration["value"] if isinstance(enumeration, dict) else enumeration
            if len(candidates) > 1000:
                raise ValueError("PUBLIC_CANDIDATE_BOUND_EXCEEDED")
            result["enumeration"] = {"source": "getProgramAccounts", "returnedCandidates": len(candidates),
                                     "observedContextSlot": enumeration.get("context", {}).get("slot") if isinstance(enumeration, dict) else None}
        except Exception as error:
            result["rpcFailures"].append({"method": "getProgramAccounts", "errorType": sanitized_error(error)})
            try:
                account = rpc("getAccountInfo", [PUBLISHED_REGISTRY, {"encoding": "base64", "commitment": "finalized"}])
                if account.get("value"):
                    candidates = [{"pubkey": PUBLISHED_REGISTRY, "account": account["value"]}]
                    result["enumeration"] = {"source": "publishedRegistryFallback", "returnedCandidates": 1,
                                             "observedContextSlot": account.get("context", {}).get("slot")}
            except Exception as fallback_error:
                result["rpcFailures"].append({"method": "getAccountInfo", "errorType": sanitized_error(fallback_error)})

        skipped = 0
        for candidate in candidates:
            try:
                account = candidate["account"]
                key = registry_route_key(candidate["pubkey"], account["owner"], base64.b64decode(account["data"][0], validate=True))
                head_leaf = poseidon_v1([key, 1, int(proof["memoCommitment"], 16), int(proof["actionCommitment"], 16), public_portfolio])
                head_root = insert_empty(head_leaf, key, zeros128)
                reconstructed = poseidon_v1([head_root, new_nullifier_root])
                result["publicCandidates"].append({"registry": candidate["pubkey"], "publicRouteKey": hex_field(key),
                    "reconstructedGlobalRoot": hex_field(reconstructed), "matchesCreditSuccessor": hex_field(reconstructed) == proof["newGlobalRoot"]})
            except Exception:
                skipped += 1
        result["skippedUnsupportedCandidates"] = skipped
    result["matchingPublicRegistryCount"] = sum(candidate["matchesCreditSuccessor"] for candidate in result["publicCandidates"])
    result["outcome"] = "VERIFIED_PUBLIC_REGISTRY_LINK" if result["matchingPublicRegistryCount"] and all(result["rpcChecks"].values()) and result["rpcChecks"] else "PARTIAL_OR_NO_MATCH"
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("x", encoding="utf-8") as output:
        json.dump(result, output, indent=2)
        output.write("\n")
    print(json.dumps({"outcome": result["outcome"], "matchingPublicRegistryCount": result["matchingPublicRegistryCount"],
                      "validPublicCandidates": len(result["publicCandidates"]), "rpcFailureCount": len(result["rpcFailures"]),
                      "output": str(args.out)}, indent=2))


if __name__ == "__main__":
    main()
