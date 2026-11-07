import base64, copy, hashlib, json, os, subprocess, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import asyncio
from app.solana_pubkey import Pubkey
from credit_amount import commitment, publish_opening
from funding_note import funded_leaf
from funding_snapshot_sync import ensure_funding_snapshot, sealed_pool_address, TCAP_PROGRAM
from gpru_crypto import BABYJUB_FIELD, poseidon_v1
from hidden_head_witness import SparseTree, hex_field
from private_credit_coordination import admitted_pool_sources, qualified_sources, schedule, pool_release_slot, PoolCaptureTiming, build_epoch_witness, PrivateCreditWait
from test_funding_note import note, append_event, funding_root_address

class PrivateCoordinationTests(unittest.TestCase):
    def test_amount_commitment_binds_every_opening_and_repeated_amount_is_blinded(self):
        original=commitment(7,500000,11,13)
        for args in [(7,500000,12,13),(8,500000,11,13),(7,500001,11,13),(7,500000,11,14)]:
            self.assertNotEqual(original,commitment(*args))
        for args in [(7,0,11,13),(7,1,0,13),(7,1,BABYJUB_FIELD,13),(7,2**64,11,13)]:
            with self.assertRaises(ValueError): commitment(*args)

    def test_admission_rejects_zero_duplicate_consumed_and_nonmember_notes(self):
        rows=[{"commitment":note(s)["commitment"],"nullifier":hex_field(s),"wallet":wallet,"token":7,"amount":amount}
              for s,wallet,amount in [(1,"A",100),(3,"A",200),(5,"B",300),(7,"C",400)]]
        qualified=qualified_sources(rows+[rows[0],{**rows[1],"amount":0}],{rows[1]["nullifier"]})
        snapshot={"leaves":[funded_leaf(rows[i]["commitment"],7,rows[i]["amount"]) for i in (0,2)]}
        admitted=admitted_pool_sources(qualified,snapshot)
        self.assertEqual([r["wallet"] for r in admitted],["A","B"])
        self.assertEqual(len(admitted_pool_sources([rows[0],rows[1]],snapshot)),1)

    def fixture(self,directory):
        epoch={"count":2,"token":7,"seed":hex_field(19),"address":"synthetic-epoch"}
        rows=[];digest=19
        for i,amount in enumerate((100,400)):
            w={"assetId":7,"amount":amount,"amountBlinding":i+21,"nullifier":i+31}
            w["amountCommitment"]=commitment(7,amount,w["amountBlinding"],w["nullifier"])
            publish_opening(directory,w)
            row={"epoch":epoch["address"],"sequence":i+10,"amountCommitment":hex_field(w["amountCommitment"]),"nullifier":hex_field(w["nullifier"])}
            rows.append(row);digest=poseidon_v1([digest,w["amountCommitment"],w["nullifier"]])
        epoch["digest"]=hex_field(digest)
        return epoch,rows

    def test_complete_epoch_requires_exact_order_and_all_openings(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp);epoch,rows=self.fixture(directory)
            witness=build_epoch_witness(epoch,rows[::-1],directory)
            self.assertEqual(witness["total"],500)
            for e,r in [({**epoch,"digest":hex_field(1)},rows),(epoch,rows[:1]),(epoch,[rows[0],rows[0]]),({**epoch,"count":1},rows[:1])]:
                with self.assertRaises((ValueError,PrivateCreditWait)):build_epoch_witness(e,r,directory)
            file=directory/"credit-openings"/(rows[0]["amountCommitment"]+".json")
            data=json.loads(file.read_text());data["amount"]="101";file.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError,"OPENING_MISMATCH"):build_epoch_witness(epoch,rows,directory)

    def test_activity_uses_shared_windows_and_never_selects_singleton_target(self):
        self.assertEqual(schedule([],200),(2,96))
        target,window=schedule([199]*32,200)
        self.assertGreater(target,2);self.assertLess(window,96)
        self.assertEqual(schedule([1]*100,200),(2,96))

    def test_release_budgets_two_censuses_after_checks_on_a_shared_boundary(self):
        # The old next-boundary timer at slot 100 (192) expires during these checks.
        release = pool_release_slot([90,95],100,240)
        self.assertGreater(release,240+2*(240-100)+48)
        self.assertEqual(release % 96,0)
        busy = pool_release_slot([239]*32,200,240)
        self.assertEqual(busy % 24,0)
        self.assertGreater(busy,240+2*40+48)
        for start,end in [(1,10000),(100,100),(100,240)]:
            self.assertLessEqual(pool_release_slot([],start,end),end+5000)
        for start,end in [(240,100),(0,100),(True,100)]:
            with self.assertRaises(PrivateCreditWait):pool_release_slot([],start,end)

    def test_timing_observations_are_bounded_expiring_and_asset_specific(self):
        timing = PoolCaptureTiming()
        with patch("private_credit_coordination.time.monotonic", return_value=1000):
            timing.observe("A", 100, 240)
            self.assertGreater(timing.release("A", [], 300, 310), 310 + 2*140 + 48)
            self.assertEqual(timing.release("B", [], 300, 310), pool_release_slot([],300,310))
            for start,end in [(0,10),(10,9),(True,10)]: timing.observe("A",start,end)
            self.assertEqual(len(timing.observations),3)
        with patch("private_credit_coordination.time.monotonic", return_value=1301):
            self.assertEqual(timing.release("A",[],400,410), pool_release_slot([],400,410))
        for i in range(100): timing.observe("A",500+i,501+i)
        self.assertEqual(len(timing.observations),32)
        self.assertLessEqual(timing.release("A",[],100,10000),15000)
        for slots in (-1,True,1.5):
            with self.assertRaises(PrivateCreditWait): pool_release_slot([],100,110,slots)

    @unittest.skipUnless(os.environ.get("GPRU_TEST_EPOCH_BUILD_DIR"),"compile isolated epoch circuit for witness checks")
    def test_epoch_circuit_rejects_changed_total_count_opening_and_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp);epoch,rows=self.fixture(directory)
            witness=build_epoch_witness(epoch,rows,directory)
            build=Path(os.environ["GPRU_TEST_EPOCH_BUILD_DIR"])
            def calculate(w,success):
                input=directory/"witness.json";input.write_text(json.dumps({k:[str(v) for v in value] if isinstance(value,list) else str(value) for k,value in w.items()}))
                result=subprocess.run(["node",str(build/"main_js/generate_witness.js"),str(build/"main_js/main.wasm"),str(input),str(directory/"main.wtns")],capture_output=True,timeout=120)
                self.assertEqual(result.returncode==0,success,"aggregate witness acceptance differed")
            calculate(witness,True)
            for name in ("total","count","digest","tokenId"):
                w=copy.deepcopy(witness);w[name]+=1;calculate(w,False)
            for name in ("amounts","blindings","nullifiers"):
                w=copy.deepcopy(witness);w[name][0]+=1;calculate(w,False)
            w=copy.deepcopy(witness)
            for name in ("amounts","blindings","nullifiers"):w[name][:2]=w[name][:2][::-1]
            calculate(w,False)

class PoolTimingTests(unittest.IsolatedAsyncioTestCase):
    def fixture(self,release=600):
        value={"assetEntry":"fixture-asset","reserveState":"fixture-reserve","tcapConfig":"fixture-config",
               "root":hex_field(1),"eligibleNoteCount":"2","sourceWalletCount":2,"releaseSlot":str(release)}
        work={"id":"fixture-pool","kind":"TCAP_FUNDING_POOL","status":"CRANKER_LEASED","stateVersion":7,
              "payload":{k:value[k] for k in ("assetEntry","reserveState","tcapConfig","root")},
              "crankerLease":{"owner":"fixture-operator","leaseId":"fixture-lease","version":7,"expiresAt":"2040-01-01T00:00:00Z"}}
        rows=[{"wallet":"A","slot":90},{"wallet":"B","slot":95}]
        return value,work,rows

    async def test_verification_anchors_release_after_the_census(self):
        import server
        from unittest.mock import AsyncMock
        _,work,rows=self.fixture()
        roots=[{"root":hex_field(1),"count":2,"slot":100},{"root":hex_field(1),"count":2,"slot":240}]
        with patch.object(server,"read_funding_root",AsyncMock(side_effect=roots)), \
             patch.object(server,"ensure_funding_snapshot",AsyncMock(return_value={})), \
             patch.object(server,"_qualified_private_funding",AsyncMock(return_value=rows)), \
             patch.object(server,"admitted_pool_sources",return_value=rows):
            evidence=await server._verify_private_coordination_work(work)
        value=evidence["verifiedPayload"]["tcapFundingPool"]
        self.assertGreater(int(value["releaseSlot"]),240+2*140+48)
        self.assertEqual(value["sourceWalletCount"],2)
        self.assertNotIn("wallet",value)

    async def test_verification_preserves_root_and_two_source_requirements(self):
        import server
        from unittest.mock import AsyncMock
        _,work,rows=self.fixture()
        root={"root":hex_field(1),"count":2,"slot":100}
        for admitted,last,exception in [
                (rows,{**root,"root":hex_field(2)},ValueError),
                (rows,{**root,"count":3},ValueError),
                (rows[:1],root,PrivateCreditWait),
                ([rows[0],{**rows[1],"wallet":"A"}],root,PrivateCreditWait)]:
            with patch.object(server,"read_funding_root",AsyncMock(side_effect=[root,last])), \
                 patch.object(server,"ensure_funding_snapshot",AsyncMock(return_value={})), \
                 patch.object(server,"_qualified_private_funding",AsyncMock(return_value=admitted)), \
                 patch.object(server,"admitted_pool_sources",return_value=admitted):
                with self.assertRaises(exception):await server._verify_private_coordination_work(work)

    async def test_authorization_rechecks_expiry_and_root_after_the_census(self):
        import server
        from unittest.mock import AsyncMock
        value,work,rows=self.fixture(release=150)
        first={"root":value["root"],"count":2,"slot":100}
        for last,valid in [({**first,"slot":140},True),({**first,"slot":170},False),
                           ({**first,"root":hex_field(2)},False),({**first,"count":3},False),
                           ({**first,"slot":99},False), ({**first,"slot":0},False),
                            ({**first,"slot":140},True)]:
            with patch.object(server,"_receiver_verified_payload",return_value={"tcapFundingPool":value}), \
                 patch.object(server,"_assert_stored_settlement_attestation"), \
                 patch.object(server,"read_funding_root",AsyncMock(side_effect=[first,last])), \
                 patch.object(server,"ensure_funding_snapshot",AsyncMock(return_value={})), \
                 patch.object(server,"_qualified_private_funding",AsyncMock(return_value=rows)), \
                 patch.object(server,"admitted_pool_sources",return_value=rows), \
                 patch.object(server,"_receiver_work_by_id",AsyncMock(return_value=work)):
                if valid:
                    auth=await server._authorize_private_coordination(work,"fixture-operator")
                    self.assertEqual(auth["transition"],value)
                else:
                    with self.assertRaises(server.HTTPException) as rejected:
                        await server._authorize_private_coordination(work,"fixture-operator")
                    self.assertEqual(rejected.exception.status_code,409)
                    self.assertEqual(rejected.exception.detail,"TCAP_POOL_CAPTURE_STALE")

    async def test_slow_unsigned_authorization_increases_the_next_release_budget(self):
        import server
        from unittest.mock import AsyncMock
        value,work,rows=self.fixture()
        root={"root":value["root"],"count":2,"slot":100}
        roots=[{**root,"slot":slot} for slot in (100,110,120,200,210,220,230,310,330,410)]
        with patch.object(server,"_pool_capture_timing",PoolCaptureTiming()), \
             patch.object(server,"_assert_stored_settlement_attestation"), \
             patch.object(server,"read_funding_root",AsyncMock(side_effect=roots)), \
             patch.object(server,"ensure_funding_snapshot",AsyncMock(return_value={})), \
             patch.object(server,"_qualified_private_funding",AsyncMock(return_value=rows)), \
             patch.object(server,"admitted_pool_sources",return_value=rows), \
             patch.object(server,"_receiver_work_by_id",AsyncMock(return_value=work)):
            first=await server._verify_private_coordination_work(work)
            work["verification"]={"verifiedPayload":first["verifiedPayload"]}
            with self.assertLogs(server.logger,level="INFO") as logs:
                with self.assertRaises(server.HTTPException) as expired:
                    await server._authorize_private_coordination(work,"fixture-operator")
            self.assertEqual(expired.exception.detail,"TCAP_POOL_CAPTURE_STALE")
            self.assertIn("cause=RELEASE_EXPIRED",logs.output[0])
            # A fresh Node verification uses the later 80-slot pass, not its own 10 slots.
            retried=await server._verify_private_coordination_work(work)
            value=retried["verifiedPayload"]["tcapFundingPool"]
            self.assertGreater(int(value["releaseSlot"]),220+160+48)
            self.assertLessEqual(int(value["releaseSlot"]),220+5000)
            work["verification"]={"verifiedPayload":retried["verifiedPayload"]}
            for _ in range(2):
                authorization=await server._authorize_private_coordination(work,"fixture-operator")
                self.assertEqual(authorization["transition"],value)


class EpochRealProofTests(unittest.TestCase):
    fixture = PrivateCoordinationTests.fixture
    @unittest.skipUnless(os.environ.get("GPRU_TEST_EPOCH_PROVER_DIR"),"matching isolated development epoch keys required")
    def test_real_epoch_proof_serialized_reverification_and_mutations(self):
        from tcap_epoch_prover import prove_epoch,GPRU
        build=Path(os.environ["GPRU_TEST_EPOCH_BUILD_DIR"])
        artifacts=Path(os.environ["GPRU_TEST_EPOCH_PROVER_DIR"])
        metadata=artifacts/"dev-setup.json"
        args=json.loads((artifacts/"verifier-init-args.json").read_text())
        points=b"".join(bytes(args[k]) for k in ("alpha_g1","beta_g2","gamma_g2","delta_g2"))+b"".join(bytes(p) for p in args["ic"])
        address,bump=Pubkey.find_program_address([b"gpru:tcap-epoch-verifier:v1"],Pubkey.from_string(GPRU))
        data=hashlib.sha256(b"account:GpruTcapEpochVerifierV1").digest()[:8]+b"\x01\x00"+bytes(32)+bytes(args["circuit_commitment"])+bytes(args["key_commitment"])+bytes([1,bump])+points
        self.assertEqual(len(data),940)
        async def rpc(method,params):
            self.assertEqual(method,"getAccountInfo");self.assertEqual(params[0],str(address))
            return {"result":{"value":{"owner":GPRU,"data":[base64.b64encode(data).decode(),"base64"]}}}
        environment={"GPRU_EPOCH_CIRCUIT_BUILD_DIR":str(build),"GPRU_EPOCH_CIRCUIT_WASM_PATH":str(build/"main_js/main.wasm"),
            "GPRU_EPOCH_PROVING_KEY_PATH":str(artifacts/"tcap_epoch_dev_only.zkey"),"GPRU_EPOCH_VERIFICATION_KEY_PATH":str(artifacts/"verification_key.json"),
            "GPRU_EPOCH_PROVER_METADATA_PATH":str(metadata),"GPRU_EPOCH_PROVER_METADATA_SHA256":hashlib.sha256(metadata.read_bytes()).hexdigest()}
        with tempfile.TemporaryDirectory() as tmp:
            epoch,rows=self.fixture(Path(tmp));witness=build_epoch_witness(epoch,rows,Path(tmp))
            async def run():
                proof=await prove_epoch(witness,rpc)
                self.assertEqual(proof,await prove_epoch(witness,rpc,existing_proof=proof))
                if os.environ.get("TSN_GPRU_EPOCH_PROOF_FIXTURE"):
                    encoded=points+b"".join(bytes.fromhex(v) for v in proof["publicInputs"])+b"".join(bytes.fromhex(proof[k]) for k in ("proofA","proofB","proofC"))
                    self.assertEqual(len(encoded),1248)
                    Path(os.environ["TSN_GPRU_EPOCH_PROOF_FIXTURE"]).write_bytes(encoded)
                for index in range(5):
                    changed=copy.deepcopy(proof);changed["publicInputs"][index]=hex_field(int(changed["publicInputs"][index],16)+1)
                    with self.assertRaisesRegex(ValueError,"LOCAL_PROOF_FAILED"):
                        await prove_epoch(witness,rpc,existing_proof=changed)
                changed=copy.deepcopy(witness);changed["amounts"][0]+=1
                with self.assertRaisesRegex(ValueError,"LOCAL_PROOF_FAILED"):await prove_epoch(changed,rpc)
            with patch.dict(os.environ,environment):asyncio.run(run())

class SealedSnapshotTests(unittest.IsolatedAsyncioTestCase):
    async def test_later_global_deposits_do_not_invalidate_sealed_history(self):
        openings=[note(1),note(3),note(5)]
        leaves=[funded_leaf(n["commitment"],7,100) for n in openings]
        root=hex_field(SparseTree(32,dict(enumerate(leaves[:2]))).root)
        asset=str(Pubkey(bytes([7])*32));address,bump=sealed_pool_address(asset,root)
        data=(hashlib.sha256(b"account:TcapSealedFundingPoolV1").digest()[:8]+b"\x01\x00"+bytes([bump])+bytes(Pubkey.from_string(asset))+(7).to_bytes(4,"little")+bytes.fromhex(root)+(2).to_bytes(8,"little")*2+(2).to_bytes(2,"little")+(10).to_bytes(8,"little")*2)
        receipts={}
        for i in range(3):
            receipts[str(i)]=append_event(i,openings[i],7,100,leaves[:i+1]);receipts[str(i)]["transaction"]={"signatures":[str(i)]}
        seen=[]
        async def rpc(method,params):
            seen.append((method,params[0]))
            if method=="getSignaturesForAddress":return {"result":[{"signature":str(i),"err":None} for i in (2,1,0)]}
            if method=="getTransaction":return {"result":receipts[params[0]]}
            self.assertEqual(params[0],str(address),"final authority must be sealed pool")
            return {"result":{"value":{"owner":TCAP_PROGRAM,"data":[base64.b64encode(data).decode(),"base64"]},"context":{"slot":20}}}
        selected={"root":root,"count":2,"address":str(address),"asset":asset,"token":7,"sealed":True}
        with tempfile.TemporaryDirectory() as tmp:
            snapshot=await ensure_funding_snapshot(Path(tmp),selected,rpc)
            self.assertEqual(snapshot["leaves"],leaves[:2])
            self.assertEqual(seen[0],("getSignaturesForAddress",str(funding_root_address()[0])))

class UnsignedStaleWorkTests(unittest.IsolatedAsyncioTestCase):
    async def test_stale_roots_defer_instead_of_permanently_rejecting_funding(self):
        import server
        from unittest.mock import AsyncMock
        work={"id":"synthetic-settlement","kind":"SETTLEMENT","stateVersion":4,"payloadCommitment":"a"*64}
        class Response:
            def raise_for_status(self):pass
        for reason in ("TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT","TCAP_CREDIT_EPOCH_CHANGED_BEFORE_SETTLEMENT"):
            verifier=AsyncMock(side_effect=ValueError(reason));request=AsyncMock(return_value=Response())
            with patch.object(server,"_verify_receiver_work",verifier),patch.object(server,"receiver_request",request):
                await server._verify_and_report_receiver_work(None,{},work)
            request.assert_awaited_once()
            self.assertEqual(request.call_args.args[2],"/api/internal/node/coordination")
            self.assertEqual(request.call_args.kwargs["json"]["action"],"defer")
