"""private_payment_validation_error: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from typing import Any, Callable, Protocol



async def private_payment_validation_error(request: Request, exc: RequestValidationError):
    if request.url.path in {"/intents", "/network/funding/readiness", "/network/funding/complete", "/network/tin-debit", "/network/tin-debit/prepare"}:
        # Pydantic's default missing-field errors may include the entire input,
        # including a valid private note alongside the invalid/missing field.
        return JSONResponse(status_code=422, content={"detail": "Invalid payment request fields"})
    return await request_validation_exception_handler(request, exc)
