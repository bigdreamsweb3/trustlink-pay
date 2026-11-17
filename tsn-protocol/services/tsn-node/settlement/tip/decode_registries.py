"""decode_registries implementation; preserve inputs, encodings and errors."""
from __future__ import annotations
from settlement.tip.decode_registry import decode_registry

def decode_registries(addresses, accounts, tip_program):
    return [decode_registry(address, data, tip_program) for address, data in zip(addresses, accounts)]
