"""_verification_rejection_reason: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from typing import Any, Callable, Protocol



def _verification_rejection_reason(exc: Exception) -> str:
    if isinstance(exc, (ValidationError, RequestValidationError)):
        return "Invalid Receiver payment request fields"
    return str(exc)[:500]
