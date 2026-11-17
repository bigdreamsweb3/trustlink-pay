"""Chain-backed private-credit scheduling and complete epoch reconstruction.

Only the TCAP transcript and aggregate proof authorize liability reclassification.

Public export interface; implementations live in the named component packages.
"""
from __future__ import annotations
import base64
import hashlib
from pathlib import Path
from typing import Any
from app.solana_pubkey import Pubkey
from security.cryptography.gpru_contract import BABYJUB_FIELD
from security.cryptography.poseidon_v1 import poseidon_v1
from settlement.witness.hex_field import hex_field
from amounts.credit.read_opening import read_opening
from settlement.funding.funding_contract import TCAP_PROGRAM
from settlement.accounting.private_credit_wait import PrivateCreditWait
from settlement.accounting.read_epoch import read_epoch
from settlement.accounting.build_epoch_witness import build_epoch_witness
from settlement.accounting.epoch_credits import epoch_credits
