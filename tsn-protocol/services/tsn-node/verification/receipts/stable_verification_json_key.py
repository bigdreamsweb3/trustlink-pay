"""stable_verification_json_key: isolated helper; captured dependencies are explicit arguments."""
from __future__ import annotations
from decimal import Decimal
from typing import Any
import json
import math
from typing import Any, Protocol
class Dependencies(Protocol):
    _stable_verification_json: Any

def stable_verification_json_key(item):
    return str(item[0])
