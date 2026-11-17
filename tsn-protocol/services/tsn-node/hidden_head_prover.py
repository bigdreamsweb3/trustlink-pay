"""Local-only Groth16 invocation and binding to GPRU's on-chain verifier.

Public export interface; implementations live in the named component packages.
"""
from __future__ import annotations
import asyncio
import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any
from settlement.witness.hex_field import hex_field
from settlement.proving.hidden_head_contract import PUBLIC_SIGNALS
from settlement.proving.hidden_head_contract import _prover_lock
from settlement.proving.validate_prover_result import validate_prover_result
from settlement.proving.prove_hidden_head_credit import prove_hidden_head_credit
