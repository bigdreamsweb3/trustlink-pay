"""Synthetic public debit context; no real keys, RPC or private balances."""
import base64
import hashlib
from types import SimpleNamespace
from app.solana_pubkey import Pubkey
from settlement.debit.accounts import debit_accounts
from settlement.debit.deployment import debit_deployment
from settlement.debit.digest import debit_digest
from settlement.debit.contract import FIELD


def fixture():
    node = SimpleNamespace(TSN_PROGRAM_ID="TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V",
        TCAP_PROGRAM_ID="tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF",
        GPRU_PROGRAM_ID="6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR", TINS_PROGRAM_ID="TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT")
    authority = str(Pubkey(hashlib.sha256(b"synthetic mother").digest()))
    asset = str(Pubkey(hashlib.sha256(b"synthetic asset").digest()))
    accounts = debit_accounts(node, asset, authority)
    x = format(5299619240641551281634865583518297030282874472190772894086521144482721001553, "064x")
    y = format(16950150798460657717958625567821834550301663161624707787222815936182638968203, "064x")
    inputs = [format(v, "064x") for v in (1,2,3,4,5,1,10,100,19,20,21,22,0,0,31,32,0,0,0,0,23,23,0,0,0,0)]
    inputs[4] = debit_deployment(accounts)
    for i in (16,17,22,23): inputs[i] = x
    for i in (18,19,24,25): inputs[i] = y
    memos = []
    for leg in (0,1):
        binary = bytes([1,leg]) + b"".join(bytes.fromhex(inputs[i]) for i in (14+leg,16+leg,18+leg,10,20+leg,22+leg,24+leg)) + bytes(190)
        memo = "TSN_GPRU_TIN_DEBIT_MEMO_V1:" + base64.urlsafe_b64encode(binary).decode().rstrip("=")
        inputs[12+leg] = format(int.from_bytes(hashlib.sha256(memo.encode()).digest(),"big") % FIELD,"064x")
        memos.append(memo)
    digest = debit_digest(accounts, inputs)
    accounts = debit_accounts(node, asset, authority, digest)
    transition = {**accounts, "proof":{"publicInputs":inputs,"proofA":"01"*64,"proofB":"01"*128,"proofC":"01"*64},
        "memoPayloads":memos,"authorizationDigest":digest,"tokenId":1,"amountCommitment":inputs[8],"authorizationCommitment":inputs[9],
        "actionCommitment":inputs[10],"nullifier":inputs[11],"previousTcapRoot":inputs[0],"newTcapRoot":inputs[1],"tcapRootSequence":"5",
        "validAfterSlot":"10","expiresAtSlot":"100","deploymentCommitment":inputs[4]}
    return node, transition
