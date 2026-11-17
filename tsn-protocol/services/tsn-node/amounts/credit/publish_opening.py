"""publish_opening implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from pathlib import Path
from amounts.credit.commitment import commitment
import json
import os
import secrets

def publish_opening(directory:Path,witness:dict)->None:
    value={"version":2,"tokenId":witness["assetId"],"amount":str(witness["amount"]),
        "blinding":str(witness["amountBlinding"]),"nullifier":format(witness["nullifier"],"064x")}
    key=format(commitment(value["tokenId"],int(value["amount"]),int(value["blinding"]),int(value["nullifier"],16)),"064x")
    if key!=format(witness["amountCommitment"],"064x"):raise ValueError("PRIVATE_CREDIT_OPENING_MISMATCH")
    folder=directory/"credit-openings";folder.mkdir(parents=True,exist_ok=True)
    encoded=json.dumps(value,sort_keys=True,separators=(",",":")).encode("ascii")
    target=folder/f"{key}.json";temporary=folder/f".{secrets.token_hex(16)}.tmp"
    try:
        with temporary.open("xb")as stream:stream.write(encoded);stream.flush();os.fsync(stream.fileno())
        try:os.link(temporary,target)
        except FileExistsError:
            if target.read_bytes()!=encoded:raise ValueError("PRIVATE_CREDIT_OPENING_ALREADY_DIFFERENT")
    finally:temporary.unlink(missing_ok=True)
