"""PrivateCreditWait.__init__ implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations


def __init__(self, reason: str, seconds: int = 8):
    Exception.__init__(self, reason)
    self.seconds = max(1, min(60, seconds))
