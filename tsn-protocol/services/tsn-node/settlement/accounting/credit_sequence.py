"""Return the existing accepted-credit sequence ordering key."""
from __future__ import annotations


def credit_sequence(row):
    return row["sequence"]
