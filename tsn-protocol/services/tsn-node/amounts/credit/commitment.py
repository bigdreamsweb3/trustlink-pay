"""commitment implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from security.cryptography.gpru_contract import BABYJUB_FIELD
from amounts.credit.credit_contract import DOMAIN
from security.cryptography.poseidon_v1 import poseidon_v1

def commitment(token_id:int,amount:int,blinding:int,nullifier:int)->int:
    if (type(token_id)is not int or not 0<token_id<=0xffffffff or type(amount)is not int
        or not 0<amount<=0xffffffffffffffff or type(blinding)is not int or not 0<blinding<BABYJUB_FIELD
        or type(nullifier)is not int or not 0<nullifier<BABYJUB_FIELD):
        raise ValueError("INVALID_PRIVATE_CREDIT_AMOUNT_OPENING")
    return poseidon_v1([DOMAIN,token_id,amount,blinding,nullifier])
