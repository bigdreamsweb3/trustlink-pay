"""_babyjub_add implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from security.cryptography.gpru_contract import BABYJUB_A
from security.cryptography.gpru_contract import BABYJUB_D
from security.cryptography.gpru_contract import BABYJUB_FIELD

def _babyjub_add(left: tuple[int, int], right: tuple[int, int]) -> tuple[int, int]:
    x1, y1 = left
    x2, y2 = right
    product = x1 * x2 * y1 * y2 % BABYJUB_FIELD
    x = (x1 * y2 + y1 * x2) * pow(1 + BABYJUB_D * product, -1, BABYJUB_FIELD) % BABYJUB_FIELD
    y = (y1 * y2 - BABYJUB_A * x1 * x2) * pow(1 - BABYJUB_D * product, -1, BABYJUB_FIELD) % BABYJUB_FIELD
    return x, y
