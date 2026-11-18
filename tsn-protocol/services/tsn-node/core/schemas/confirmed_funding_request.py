"""Read confirmed funding using receipt authority rather than expired bank hints.

The optional historical tuple is retained as data. This model never admits new
funding or submits a missing-context deposit; those use CreateIntentRequest.
"""
from typing import Any, Optional
from pydantic import Field
from .payment_authorization_fields import PaymentAuthorizationFields


class ConfirmedFundingRequest(PaymentAuthorizationFields):
    senderSignedFundingTransaction: str = Field(..., description="Original owner-signed deposit retained for receipt verification")
    senderFundingBlockhashContext: Optional[dict[str, Any]] = Field(None, repr=False, description="Retained RPC hint unused by confirmed receipt verification")
