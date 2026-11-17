"""funding_root_address implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from settlement.funding.funding_contract import ROOT_SEED
from settlement.funding.funding_contract import TCAP_PROGRAM

def funding_root_address(program: str = TCAP_PROGRAM) -> tuple[Pubkey, int]:
    return Pubkey.find_program_address([ROOT_SEED], Pubkey.from_string(program))
