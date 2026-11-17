"""Private amount openings shared by credit and complete-epoch proving.

Public export interface; implementations live in the named component packages.
"""
from __future__ import annotations
import json
import os
import re
import secrets
from pathlib import Path
from security.cryptography.gpru_contract import BABYJUB_FIELD
from security.cryptography.poseidon_v1 import poseidon_v1
from amounts.credit.credit_contract import DOMAIN
from amounts.credit.commitment import commitment
from amounts.credit.publish_opening import publish_opening
from amounts.credit.read_opening import read_opening
