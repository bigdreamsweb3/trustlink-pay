"""read_opening implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from pathlib import Path
from amounts.credit.commitment import commitment
import json
import re

def read_opening(directory:Path,key:str)->dict:
    if not isinstance(key,str)or not re.fullmatch(r"[0-9a-f]{64}",key):raise ValueError("INVALID_CREDIT_COMMITMENT_KEY")
    value=json.loads((directory/"credit-openings"/f"{key}.json").read_text("ascii"))
    if set(value)!={"version","tokenId","amount","blinding","nullifier"}or value["version"]!=2:raise ValueError("INVALID_PRIVATE_CREDIT_OPENING_SCHEMA")
    if format(commitment(value["tokenId"],int(value["amount"]),int(value["blinding"]),int(value["nullifier"],16)),"064x")!=key:raise ValueError("PRIVATE_CREDIT_OPENING_MISMATCH")
    return value
