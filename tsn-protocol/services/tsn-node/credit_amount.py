"""Private amount openings shared by credit and complete-epoch proving."""
from __future__ import annotations
import json, os, re, secrets
from pathlib import Path
from gpru_crypto import BABYJUB_FIELD, poseidon_v1
DOMAIN=1880519585059740412114005250091737410720192050
def commitment(token_id:int,amount:int,blinding:int,nullifier:int)->int:
    if (type(token_id)is not int or not 0<token_id<=0xffffffff or type(amount)is not int
        or not 0<amount<=0xffffffffffffffff or type(blinding)is not int or not 0<blinding<BABYJUB_FIELD
        or type(nullifier)is not int or not 0<nullifier<BABYJUB_FIELD):
        raise ValueError("INVALID_PRIVATE_CREDIT_AMOUNT_OPENING")
    return poseidon_v1([DOMAIN,token_id,amount,blinding,nullifier])
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
def read_opening(directory:Path,key:str)->dict:
    if not isinstance(key,str)or not re.fullmatch(r"[0-9a-f]{64}",key):raise ValueError("INVALID_CREDIT_COMMITMENT_KEY")
    value=json.loads((directory/"credit-openings"/f"{key}.json").read_text("ascii"))
    if set(value)!={"version","tokenId","amount","blinding","nullifier"}or value["version"]!=2:raise ValueError("INVALID_PRIVATE_CREDIT_OPENING_SCHEMA")
    if format(commitment(value["tokenId"],int(value["amount"]),int(value["blinding"]),int(value["nullifier"],16)),"064x")!=key:raise ValueError("PRIVATE_CREDIT_OPENING_MISMATCH")
    return value
