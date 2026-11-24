"""Canonical TSNP debit instruction and two proof-bound owner Memos."""
import base64
import hashlib
from app.solana_pubkey import Pubkey
from .accounts import debit_accounts
from .deployment import debit_deployment
from .digest import debit_digest
from .contract import ACCOUNT_FIELDS, FIELD
from .public_transition import public_debit_transition


from typing import Any, Callable, Protocol


class Dependencies(Protocol):
    TSN_PROGRAM_ID: str
    TCAP_PROGRAM_ID: str
    GPRU_PROGRAM_ID: str
    TINS_PROGRAM_ID: str


def debit_instructions(node: Dependencies, transition: dict) -> list:
    value = public_debit_transition(transition)
    proof = value["proof"]
    inputs = proof["publicInputs"]
    if not isinstance(inputs, list) or len(inputs) != 26 or any(not isinstance(v, str) or len(v) != 64 or int(v, 16) >= FIELD or format(int(v, 16), "064x") != v for v in inputs):
        raise ValueError("TIN_DEBIT_PUBLIC_INPUTS_INVALID")
    accounts = debit_accounts(node, value["assetEntry"], value["authority"], value["authorizationDigest"])
    if any(value[name] != accounts[name] for name in ACCOUNT_FIELDS) or inputs[4] != debit_deployment(accounts) or value["authorizationDigest"] != debit_digest(accounts, inputs):
        raise ValueError("TIN_DEBIT_CONTEXT_OR_DIGEST_MISMATCH")
    bindings = {"previousTcapRoot": inputs[0], "newTcapRoot": inputs[1], "deploymentCommitment": inputs[4], "tokenId": int(inputs[5], 16), "validAfterSlot": str(int(inputs[6], 16)), "expiresAtSlot": str(int(inputs[7], 16)), "amountCommitment": inputs[8], "authorizationCommitment": inputs[9], "actionCommitment": inputs[10], "nullifier": inputs[11], "tcapRootSequence": str(int(inputs[3], 16) + 1)}
    if any(value[name] != expected for name, expected in bindings.items()):
        raise ValueError("TIN_DEBIT_EXECUTION_STATEMENT_MISMATCH")
    for name, size in (("proofA", 128), ("proofB", 256), ("proofC", 128)):
        encoded = proof[name]
        if not isinstance(encoded, str) or len(encoded) != size or any(c not in "0123456789abcdef" for c in encoded):
            raise ValueError("TIN_DEBIT_PROOF_ENCODING_INVALID")
    points = b"".join(bytes.fromhex(proof[name]) for name in ("proofA", "proofB", "proofC"))
    if len(points) != 256:
        raise ValueError("TIN_DEBIT_PROOF_ENCODING_INVALID")
    names = ("authority", "motherEscrow", "tcapProgram", "tsnProgram", "config", "assetEntry", "commitmentRoot", "reserveState", "authorizationSigner", "tipRouteRoot", "tinDebitVerifier", "instructions", "gpruProgram")
    data = hashlib.sha256(b"global:tsn_register_tcap_tin_debit_authorization_v1").digest()[:8] + bytes.fromhex(value["authorizationDigest"]) + b"".join(bytes.fromhex(v) for v in inputs) + points
    instructions = [(node.TSN_PROGRAM_ID, [accounts[name] for name in names], data)]
    memos = value["memoPayloads"]
    if not isinstance(memos, list) or len(memos) != 2:
        raise ValueError("TIN_DEBIT_MEMOS_INVALID")
    for leg, memo in enumerate(memos):
        prefix = "TSN_GPRU_TIN_DEBIT_MEMO_V1:"
        if not isinstance(memo, str) or len(memo) != 582 or not memo.startswith(prefix):
            raise ValueError("TIN_DEBIT_MEMO_INVALID")
        binary = base64.urlsafe_b64decode(memo[len(prefix):] + "=")
        if len(binary) != 416 or binary[:2] != bytes([1, leg]) or base64.urlsafe_b64encode(binary).decode().rstrip("=") != memo[len(prefix):]:
            raise ValueError("TIN_DEBIT_MEMO_INVALID")
        fields = ((2, 14 + leg), (34, 16 + leg), (66, 18 + leg), (98, 10), (130, 20 + leg), (162, 22 + leg), (194, 24 + leg))
        if any(binary[offset:offset + 32].hex() != inputs[index] for offset, index in fields) or format(int.from_bytes(hashlib.sha256(memo.encode()).digest(), "big") % FIELD, "064x") != inputs[12 + leg]:
            raise ValueError("TIN_DEBIT_MEMO_STATEMENT_MISMATCH")
        instructions.append(("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", [value["authority"]], memo.encode("ascii")))
    return instructions
