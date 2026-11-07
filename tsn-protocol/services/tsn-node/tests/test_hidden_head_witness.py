import copy
import asyncio
import hashlib
import json
import os
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from gpru_crypto import BABYJUB_BASE8, BABYJUB_FIELD, poseidon_v1
from hidden_head_witness import HiddenHeadWitnessStore, SparseTree, hex_field
from funding_note import NOTE_DOMAIN, funded_leaf, funding_nullifier
from credit_amount import commitment as amount_commitment


class HiddenHeadWitnessTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.route = {
            "lookupCommitment": hashlib.sha256(b"mock lookup").hexdigest(),
            "gpruElgamalKeyCommitment": hashlib.sha256(b"mock route").hexdigest(),
            "gpruBalanceScanPublicKeyX": hex_field(BABYJUB_BASE8[0]),
            "gpruBalanceScanPublicKeyY": hex_field(BABYJUB_BASE8[1]),
            "policyCommitment": hashlib.sha256(b"mock policy").hexdigest(),
        }
        leaf = poseidon_v1([int(self.route[name], 16) % BABYJUB_FIELD for name in (
            "lookupCommitment", "gpruElgamalKeyCommitment", "gpruBalanceScanPublicKeyX", "gpruBalanceScanPublicKeyY", "policyCommitment")])
        self.tip_root = hex_field(SparseTree(32, {0: leaf}).root)
        self.old_root = hex_field(poseidon_v1([SparseTree(128, {}).root] * 2))
        self.tip_path = self.directory / f"tip-{self.tip_root}.json"
        self.state_path = self.directory / f"tcap-{self.old_root}.json"
        self.tip_path.write_text(json.dumps({"version": 1, "leaves": [str(leaf)]}))
        self.state_path.write_text(json.dumps({"version": 1, "heads": {}, "nullifiers": []}))
        self.store = HiddenHeadWitnessStore(self.directory)

    def prepare(self, **overrides):
        secret = overrides.pop("funding_secret", 1)
        note = {"version": 1, "secret": hex_field(secret), "blinding": hex_field(2),
                "commitment": hex_field(poseidon_v1([NOTE_DOMAIN, secret, 2]))}
        leaf = funded_leaf(note["commitment"], overrides.get("token_id", 7), overrides.get("amount", 1000))
        tree = SparseTree(32, {0: leaf})
        membership = {"fundingRoot": tree.root, "fundingIndex": 0, "fundingSiblings": tree.siblings(0)}
        return self.store.prepare_credit(**{
            "old_root": self.old_root, "tip_root": self.tip_root, "route": self.route,
            "token_id": 7, "amount": 1000, "authorization": hex_field(123), "nullifier": funding_nullifier(note),
            "funding_note": note, "funding_membership": membership, **overrides,
        })

    def test_poseidon_matches_circom_reference_vector(self):
        self.assertEqual(poseidon_v1([1, 2]), 7853200120776062878684798364095072458815029376092732009249414926327459813530)

    def test_candidate_is_selected_only_by_its_chain_root_and_replay_fails(self):
        original = self.state_path.read_bytes()
        prepared = self.prepare()
        self.assertEqual(prepared["witness"]["priorSequence"], 0)
        self.assertEqual(prepared["witness"]["isFirstToken"], 1)
        self.store.finish_credit(prepared, hex_field(101))
        self.store.save_candidate(prepared)
        candidate = (self.directory / f"tcap-{hex_field(prepared['witness']['newGlobalRoot'])}.json").read_text()
        for name in ("fundingSecret", "fundingBlinding", "fundingIndex", "fundingSiblings", "fundingNote"):
            self.assertNotIn(name, candidate)
        self.assertEqual(original, self.state_path.read_bytes())
        next_root = hex_field(prepared["witness"]["newGlobalRoot"])
        with self.assertRaisesRegex(ValueError, "already been used"):
            self.prepare(old_root=next_root)
        second = self.prepare(old_root=next_root, funding_secret=2)
        self.assertEqual(second["witness"]["priorSequence"], 1)
        self.assertEqual(second["witness"]["isFirstToken"], 0)
        third = self.prepare(old_root=next_root, funding_secret=2, token_id=8)
        self.assertEqual(third["witness"]["isFirstToken"], 1)
        self.assertNotEqual(third["witness"]["predecessorPortfolioRoot"], SparseTree(32, {}).root)

    def test_missing_root_cannot_fall_back_to_an_old_snapshot(self):
        with self.assertRaisesRegex(RuntimeError, "chain-selected root"):
            self.prepare(old_root=hex_field(99))

    def test_route_substitution_fails_before_proving(self):
        route = {**self.route, "gpruElgamalKeyCommitment": hex_field(1)}
        with self.assertRaisesRegex(ValueError, "uniquely resolved recipient"):
            self.prepare(route=route)

    def test_tampered_tip_path_does_not_match_chain(self):
        document = json.loads(self.tip_path.read_text())
        document["leaves"].append("99")
        self.tip_path.write_text(json.dumps(document))
        with self.assertRaisesRegex(ValueError, "on-chain route root"):
            self.prepare()

    def test_tampered_nullifier_map_does_not_match_chain(self):
        self.state_path.write_text(json.dumps({"version": 1, "heads": {}, "nullifiers": [hex_field(12)]}))
        with self.assertRaisesRegex(ValueError, "on-chain shared root"):
            self.prepare()

    def test_owner_openings_are_rejected_and_not_persisted(self):
        self.state_path.write_text(json.dumps({"version": 1, "heads": {}, "nullifiers": [], "predecessorBalance": "100"}))
        with self.assertRaisesRegex(ValueError, "unsupported field set"):
            self.prepare()

    def test_snapshot_duplicate_keys_fail(self):
        self.state_path.write_text('{"version":1,"heads":{},"heads":{},"nullifiers":[]}')
        with self.assertRaisesRegex(ValueError, "duplicate keys"):
            self.prepare()

    @unittest.skipUnless(os.environ.get("GPRU_TEST_CIRCUIT_BUILD_DIR"), "set an isolated compiled circuit directory for witness checks")
    def test_real_circuit_accepts_honest_witness_and_rejects_forged_state(self):
        prepared = self.prepare()
        self.store.finish_credit(prepared, hex_field(101))
        build = Path(os.environ["GPRU_TEST_CIRCUIT_BUILD_DIR"])
        circuit = Path(__file__).resolve().parents[3] / "programs/gpru/circuits/hidden_head_v1"
        def calculate(witness, succeeds):
            filename = self.directory / "mock-witness.json"
            filename.write_text(json.dumps({k: [str(v) for v in value] if isinstance(value, list) else str(value) for k, value in witness.items()}))
            output = self.directory / "mock.wtns"
            result = subprocess.run(["node", str(build / "main_js/generate_witness.js"), str(build / "main_js/main.wasm"), str(filename), str(output)], capture_output=True, timeout=120)
            self.assertEqual(result.returncode == 0, succeeds, "circuit witness acceptance differed from expectation")
            if succeeds:
                checked = subprocess.run(["node", str(circuit / "node_modules/snarkjs/build/cli.cjs"), "wtns", "check", str(build / "main.r1cs"), str(output)], capture_output=True, timeout=120)
                self.assertEqual(checked.returncode, 0, "honest witness did not satisfy the compiled R1CS")
        calculate(prepared["witness"], True)
        # A fully consistent credit for a different note fails when the only
        # public membership anchor is switched to the actual funded-note root.
        unfunded = self.prepare(funding_secret=3)
        self.store.finish_credit(unfunded, hex_field(101))
        unfunded["witness"]["fundingRoot"] = prepared["witness"]["fundingRoot"]
        calculate(unfunded["witness"], False)
        # Recompute every old action/state relation for a wrong asset or amount;
        # the actual deposit's funding root still excludes those fabricated leaves.
        for changed in ({"token_id": 8}, {"amount": 1001}):
            rebound = self.prepare(**changed)
            self.store.finish_credit(rebound, hex_field(101))
            rebound["witness"]["fundingRoot"] = prepared["witness"]["fundingRoot"]
            calculate(rebound["witness"], False)
        # Rebind all existing action/head/nullifier-map relations to a forged
        # NF. Only the new secret-derived funding-nullifier relation is false.
        forged = copy.deepcopy(prepared)
        forged["witness"]["nullifier"] += 1
        w = forged["witness"]
        w["amountCommitment"] = amount_commitment(w["assetId"], w["amount"], w["amountBlinding"], w["nullifier"])
        w["actionCommitment"] = poseidon_v1([1, w["assetId"], w["amountCommitment"], w["authorizationCommitment"], w["nullifier"]])
        self.store.finish_credit(forged, hex_field(101))
        calculate(forged["witness"], False)
        for key in ("oldGlobalRoot", "amount", "accountPathKey", "memoCommitment", "successorBalanceX", "encryptedBlindingDelta", "fundingRoot", "fundingSecret", "fundingBlinding", "nullifier", "amountCommitment", "amountBlinding"):
            witness = copy.deepcopy(prepared["witness"])
            witness[key] += 1
            calculate(witness, False)

    @unittest.skipUnless(os.environ.get("GPRU_TEST_PROVER_DIR") and os.environ.get("GPRU_TEST_CIRCUIT_BUILD_DIR"), "provide existing matching development artifacts for the offline Groth16 test")
    def test_real_local_proof_and_serialized_reverification(self):
        from hidden_head_prover import prove_hidden_head_credit
        circuit = Path(__file__).resolve().parents[3] / "programs/gpru/circuits/hidden_head_v1"
        build = Path(os.environ["GPRU_TEST_CIRCUIT_BUILD_DIR"])
        artifacts = Path(os.environ["GPRU_TEST_PROVER_DIR"])
        metadata = json.loads((artifacts / "dev-setup.json").read_text())
        # Bind a test-only copy after confirming the independently compiled
        # source produces the R1CS/WASM already bound to these existing keys.
        # No key setup, deployment, service change or real-chain fixture occurs.
        for name, filename in (("r1csSha256", build / "main.r1cs"), ("witnessWasmSha256", build / "main_js/main.wasm")):
            self.assertEqual(hashlib.sha256(filename.read_bytes()).hexdigest(), metadata[name])
        source = (circuit / "main.circom").read_bytes()
        metadata["circuitSourceSha256"] = hashlib.sha256(source).hexdigest()
        metadata_path = self.directory / "mock-pinned-manifest.json"
        metadata_path.write_text(json.dumps(metadata))
        vk = json.loads((artifacts / "verification_key.json").read_text())
        def scalar(value):
            return int(value).to_bytes(32, "big")
        def g1(point):
            return scalar(point[0]) + scalar(point[1])
        def g2(point):
            return b"".join(scalar(v) for v in (point[0][1], point[0][0], point[1][1], point[1][0]))
        points = g1(vk["vk_alpha_1"]) + g2(vk["vk_beta_2"]) + g2(vk["vk_gamma_2"]) + g2(vk["vk_delta_2"]) + b"".join(g1(v) for v in vk["IC"])
        self.assertEqual(len(points), 1344)
        circuit_commitment = hashlib.sha256(b"TSN_GPRU_HIDDEN_HEAD_CIRCUIT_V1\0" + source + b"circomlib-poseidon-bn254-v1").digest()
        key_commitment = hashlib.sha256(b"TSN_GPRU_GROTH16_VERIFYING_KEY_V1\0" + points).digest()
        fixture_verifier = hashlib.sha256(b"account:GpruHiddenHeadVerifierV2").digest()[:8] + b"\x02\x00" + bytes(32) + circuit_commitment + key_commitment + b"\x01\xff" + points
        prepared = self.prepare()
        self.store.finish_credit(prepared, hex_field(101))
        environment = {
            "GPRU_CIRCUIT_BUILD_DIR": str(build), "GPRU_CIRCUIT_WASM_PATH": str(build / "main_js/main.wasm"),
            "GPRU_PROVING_KEY_PATH": str(artifacts / "hidden_head_dev_only.zkey"),
            "GPRU_VERIFICATION_KEY_PATH": str(artifacts / "verification_key.json"),
            "GPRU_PROVER_METADATA_PATH": str(metadata_path),
            "GPRU_PROVER_METADATA_SHA256": hashlib.sha256(metadata_path.read_bytes()).hexdigest(),
        }
        async def run():
            proof = await prove_hidden_head_credit(prepared["witness"], fixture_verifier, 255)
            checked = await prove_hidden_head_credit(prepared["witness"], fixture_verifier, 255, existing_proof=proof)
            self.assertEqual(proof, checked)
            fixture_path = os.environ.get("TSN_GPRU_FUNDED_PROOF_FIXTURE")
            if fixture_path:
                encoded = points + b"".join(bytes.fromhex(value) for value in proof["publicInputs"])
                encoded += b"".join(bytes.fromhex(proof[name]) for name in ("proofA", "proofB", "proofC"))
                self.assertEqual(len(encoded), 2016)
                # Public verifier/proof bytes only; never export witness openings.
                Path(fixture_path).write_bytes(encoded)
            tampered = copy.deepcopy(proof)
            tampered["publicInputs"][0] = hex_field(99)
            with self.assertRaisesRegex(ValueError, "generation or verification failed"):
                await prove_hidden_head_credit(prepared["witness"], fixture_verifier, 255, existing_proof=tampered)
        with patch.dict(os.environ, environment):
            asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
