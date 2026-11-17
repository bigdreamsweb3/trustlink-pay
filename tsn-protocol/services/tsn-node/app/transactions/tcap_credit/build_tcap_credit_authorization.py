from __future__ import annotations



def build_tcap_credit_authorization(**fields: object) -> TcapCreditAuthorizationV2:
    """Node-side constructor used after proof verification and tip read."""
    from .types import TcapCreditAuthorizationV2
    return TcapCreditAuthorizationV2(**fields)  # type: ignore[arg-type]
