"""Check two native-credit correlation channels using synthetic, offline fixtures.

The current witness builder creates the fixture statements. Observer functions
receive allowlisted public statement fields and synthetic public TIP registry
records, never witness paths, hidden sequence values, TINs or private scalars.
No proving, decryption, RPC, signing or service changes are performed. The only
written file is the requested sanitized result JSON.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
NODE = ROOT / "tsn-protocol/services/tsn-node"
sys.path.insert(0, str(NODE))

from gpru_crypto import BABYJUB_BASE8, BABYJUB_FIELD, poseidon_v1  # noqa: E402
from hidden_head_witness import HiddenHeadWitnessStore, SparseTree, hex_field  # noqa: E402


def public_registry(label: str) -> dict[str, str]:
    """Synthetic cleartext TIP route fields; no owner secrets or real identity."""
    digest = lambda purpose: hashlib.sha256(f"synthetic-{label}-{purpose}".encode()).hexdigest()
    return {
        "lookupCommitment": digest("lookup"),
        "gpruElgamalKeyCommitment": digest("route"),
        "gpruBalanceScanPublicKeyX": hex_field(BABYJUB_BASE8[0]),
        "gpruBalanceScanPublicKeyY": hex_field(BABYJUB_BASE8[1]),
        "policyCommitment": digest("policy"),
    }


def public_key(record: dict[str, str]) -> int:
    """Matches the builder's route_key derivation from a public TIP field."""
    return int(record["gpruElgamalKeyCommitment"], 16) % BABYJUB_FIELD


def public_statement(prepared: dict, token_id: int) -> dict[str, int]:
    names = (
        "oldGlobalRoot", "newGlobalRoot", "memoCommitment", "actionCommitment",
        "nullifier", "successorPortfolioRoot", "successorBalanceX", "successorBalanceY",
    )
    return {"tokenId": token_id, **{name: prepared["witness"][name] for name in names}}


def observer_portfolio(statements: list[dict[str, int]]) -> int:
    """Consumes only public token IDs and successor X/Y, with no route input."""
    leaves = {
        statement["tokenId"]: poseidon_v1([
            statement["tokenId"], statement["successorBalanceX"], statement["successorBalanceY"],
        ]) for statement in statements
    }
    return SparseTree(32, leaves).root


def observer_candidate_root(
    public_records: dict[str, dict[str, str]], candidate: str,
    statement: dict[str, int], known_heads: dict[str, dict[str, int]],
    known_nullifiers: list[int],
) -> int:
    """Reconstruct a candidate global root from public history and registries.

    Starting from known empty trees, the observer maintains each inferred
    registry's count. The next sequence is inferred from that public-history
    hypothesis rather than copied from the private fixture witness.
    """
    head_leaves = {}
    for label, head in known_heads.items():
        key = public_key(public_records[label])
        head_leaves[key % (1 << 128)] = poseidon_v1([
            key, head["sequence"], head["memoCommitment"], head["actionCommitment"],
            head["successorPortfolioRoot"],
        ])
    key = public_key(public_records[candidate])
    inferred_sequence = known_heads.get(candidate, {}).get("sequence", 0) + 1
    head_leaves[key % (1 << 128)] = poseidon_v1([
        key, inferred_sequence, statement["memoCommitment"], statement["actionCommitment"],
        statement["successorPortfolioRoot"],
    ])
    consumed = known_nullifiers + [statement["nullifier"]]
    nullifier_leaves = {poseidon_v1([value]) % (1 << 128): poseidon_v1([value]) for value in consumed}
    return poseidon_v1([SparseTree(128, head_leaves).root, SparseTree(128, nullifier_leaves).root])


def check() -> dict[str, bool]:
    records = {label: public_registry(label) for label in ("A", "B")}
    route_fields = (
        "lookupCommitment", "gpruElgamalKeyCommitment", "gpruBalanceScanPublicKeyX",
        "gpruBalanceScanPublicKeyY", "policyCommitment",
    )
    routes = {"version": 1, "leaves": [
        str(poseidon_v1([int(record[name], 16) % BABYJUB_FIELD for name in route_fields]))
        for record in records.values()
    ]}
    tip_root = hex_field(SparseTree(32, {index: int(leaf) for index, leaf in enumerate(routes["leaves"])}).root)
    empty_tree_root = SparseTree(128, {}).root
    empty_root = hex_field(poseidon_v1([empty_tree_root, empty_tree_root]))
    empty_state = {"version": 1, "heads": {}, "nullifiers": []}
    store = HiddenHeadWitnessStore(ROOT)

    def credit(state: dict, old_root: str, recipient: str, token: int, ordinal: int):
        isolated = copy.deepcopy(state)
        def fixture_snapshot(path: Path):
            return routes if path.name.startswith("tip-") else isolated
        with patch("hidden_head_witness._read_snapshot", side_effect=fixture_snapshot):
            prepared = store.prepare_credit(
                old_root=old_root, tip_root=tip_root, route=records[recipient],
                token_id=token, amount=ordinal * 1000,
                authorization=hex_field(ordinal + 10), nullifier=hex_field(ordinal + 20),
            )
            store.finish_credit(prepared, hex_field(ordinal + 30))
        return public_statement(prepared, token), isolated

    a7, after_a7 = credit(empty_state, empty_root, "A", 7, 1)
    a7_next, _ = credit(after_a7, hex_field(a7["newGlobalRoot"]), "A", 7, 2)
    a8, _ = credit(after_a7, hex_field(a7["newGlobalRoot"]), "A", 8, 3)
    b8, _ = credit(after_a7, hex_field(a7["newGlobalRoot"]), "B", 8, 4)
    b7, _ = credit(empty_state, empty_root, "B", 7, 5)

    first_matches = [label for label in records if observer_candidate_root(records, label, a7, {}, []) == a7["newGlobalRoot"]]
    observer_heads = {first_matches[0]: {
        "sequence": 1, "memoCommitment": a7["memoCommitment"],
        "actionCommitment": a7["actionCommitment"], "successorPortfolioRoot": a7["successorPortfolioRoot"],
    }}
    next_matches = [label for label in records if observer_candidate_root(records, label, a7_next, observer_heads, [a7["nullifier"]]) == a7_next["newGlobalRoot"]]
    different_matches = [label for label in records if observer_candidate_root(records, label, b8, observer_heads, [a7["nullifier"]]) == b8["newGlobalRoot"]]

    checks = {
        "public_registry_key_matches_builder_formula": public_key(records["A"]) == int(records["A"]["gpruElgamalKeyCommitment"], 16) % BABYJUB_FIELD,
        "genesis_public_registry_dictionary_identifies_A": first_matches == ["A"],
        "genesis_wrong_registry_candidate_fails": "B" not in first_matches,
        "maintained_public_history_same_token_identifies_A_again": next_matches == ["A"],
        "maintained_public_history_different_recipient_identifies_B": different_matches == ["B"],
        "cross_asset_same_recipient_public_portfolio_matches": observer_portfolio([a7, a8]) == a8["successorPortfolioRoot"],
        "one_token_reconstruction_fails_for_multi_asset_portfolio": observer_portfolio([a8]) != a8["successorPortfolioRoot"],
        "wrong_recipient_previous_point_fails": observer_portfolio([b7, a8]) != a8["successorPortfolioRoot"],
        "different_recipient_current_point_fails": observer_portfolio([a7, b8]) != b8["successorPortfolioRoot"],
        "single_asset_A_first_root_reconstructible": observer_portfolio([a7]) == a7["successorPortfolioRoot"],
        "single_asset_A_next_root_reconstructible": observer_portfolio([a7_next]) == a7_next["successorPortfolioRoot"],
        "single_asset_B_root_reconstructible": observer_portfolio([b7]) == b7["successorPortfolioRoot"],
        "same_token_subsequent_public_point_and_root_rotate": a7["successorPortfolioRoot"] != a7_next["successorPortfolioRoot"] and (a7["successorBalanceX"], a7["successorBalanceY"]) != (a7_next["successorBalanceX"], a7_next["successorBalanceY"]),
        "single_asset_portfolio_equation_has_no_registry_input": observer_portfolio([a7]) == a7["successorPortfolioRoot"] and observer_portfolio([b7]) == b7["successorPortfolioRoot"],
    }
    for name, passed in checks.items():
        assert passed, name
    return checks


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "docs/references/native-credit-linkability-20261102.json")
    args = parser.parse_args()
    checks = check()
    source_paths = (
        "scripts/check-native-credit-linkability.py",
        "tsn-protocol/services/tsn-node/hidden_head_witness.py",
        "tsn-protocol/services/tsn-node/gpru_crypto.py",
        "tsn-protocol/services/tsn-node/server.py",
        "tsn-protocol/services/tsn-node/dbrix_transaction_record.py",
        "tsn-protocol/programs/gpru/circuits/hidden_head_v1/main.circom",
        "tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs",
    )
    result = {
        "status": "VERIFIED offline synthetic structural correlation only",
        "checkedAtUtc": datetime.now(timezone.utc).isoformat(),
        "command": ".\\.venv\\Scripts\\python.exe scripts/check-native-credit-linkability.py --output docs/references/native-credit-linkability-20261102.json",
        "pythonVersion": sys.version.split()[0],
        "checks": checks,
        "sourceSha256": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in source_paths},
        "observerInputs": {
            "portfolio": ["public token IDs", "public successor balance X/Y", "public successor portfolio root for comparison"],
            "registryDictionary": ["public TIP ElGamal key commitment", "public old/new global roots", "public Memo/action commitments", "public successor portfolio root", "public nullifiers", "known empty initial trees and maintained inferred history"],
        },
        "conclusions": [
            "The tested known-empty-map dictionary identifies a synthetic public registry and links a subsequent same-token credit to that registry.",
            "The public portfolio root links cross-asset outputs when the correct unchanged token points can be hypothesized; wrong-recipient controls fail.",
            "The one-token portfolio equation alone is independent of the registry and cannot identify it; the separate global-root dictionary can.",
        ],
        "limits": [
            "No actual TIN, registry, witness, private path, scalar, route key or raw public statement value is included in this result.",
            "Known genesis state, enumerable current public registry keys and complete usable history are assumptions of the dictionary test; arbitrary historical state was not reconstructed.",
            "Identifying a public TIP registry is not plaintext TIN recovery. The TIN lookup still uses protected lookup material.",
            "No Groth16 proof, live-chain read, RPC, decryption, transaction signature, deployment or service change was performed.",
            "This is a source-level privacy test and does not quantify large-registry enumeration cost or establish a complete security audit.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\r\n")
    print(json.dumps({"checksPassed": len(checks), "output": str(args.output), "status": result["status"]}))


if __name__ == "__main__":
    main()
