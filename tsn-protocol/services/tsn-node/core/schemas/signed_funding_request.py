"""Final immutable funding payload reconstructed only after atomic attachment."""
from pydantic import Field
from .payment_authorization_fields import PaymentAuthorizationFields
from .sender_funding_blockhash_context import SenderFundingBlockhashContext


class SignedFundingRequest(PaymentAuthorizationFields):
    senderSignedFundingTransaction: str = Field(..., repr=False)
    senderFundingBlockhashContext: SenderFundingBlockhashContext
