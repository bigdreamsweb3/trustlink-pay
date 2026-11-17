"""Private funding openings and public, amount-bound TCAP leaves.

Only the note commitment crosses the wallet/chain boundary. The funded leaf
is constructed by TCAP from that commitment and the actual registered deposit.

Public export interface; implementations live in the named component packages.
"""
from __future__ import annotations
from typing import Any
from security.cryptography.poseidon_v1 import poseidon_v1
from settlement.witness.field_hex import field_hex
from settlement.witness.hex_field import hex_field
from settlement.funding.note_contract import NOTE_DOMAIN
from settlement.funding.note_contract import FUNDED_LEAF_DOMAIN
from settlement.funding.note_contract import NULLIFIER_DOMAIN
from settlement.funding.validate_funding_note import validate_funding_note
from settlement.funding.funding_nullifier import funding_nullifier
from settlement.funding.funded_leaf import funded_leaf
