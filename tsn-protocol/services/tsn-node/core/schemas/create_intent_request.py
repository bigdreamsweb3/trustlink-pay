"""Initial ingress contains the signed intent and private note, before funding approval."""
from .payment_authorization_fields import PaymentAuthorizationFields


class CreateIntentRequest(PaymentAuthorizationFields):
    pass
