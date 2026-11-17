"""Pinned, locally verified aggregate proving. Openings never enter argv or logs.

Public export interface; implementations live in the named component packages.
"""
from __future__ import annotations
import asyncio
import base64
import hashlib
import json
import os
from pathlib import Path
from app.solana_pubkey import Pubkey
from settlement.funding.funding_contract import TCAP_PROGRAM
from settlement.witness.hex_field import hex_field
from settlement.proving.epoch_prover_contract import GPRU
from settlement.proving.epoch_prover_contract import INPUTS
from settlement.proving.epoch_prover_contract import _lock
from settlement.proving.prove_epoch import prove_epoch
