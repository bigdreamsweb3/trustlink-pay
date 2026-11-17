"""PrivateCreditWait public class with explicit method implementations."""
from __future__ import annotations
from settlement.accounting.private_credit_wait_init import __init__ as PrivateCreditWait_init

class PrivateCreditWait(Exception):
    __init__ = PrivateCreditWait_init
