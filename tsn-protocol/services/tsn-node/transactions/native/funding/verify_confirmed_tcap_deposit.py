"""_verify_confirmed_tcap_deposit: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
import base64
import hmac
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    _read_solana_shortvec: Callable[..., Any]
    _verify_signed_tcap_deposit_contract: Callable[..., Any]
    decode_base58: Callable[..., Any]
    solana_rpc: Callable[..., Any]


async def _verify_confirmed_tcap_deposit(node: Dependencies,
    *, funding_work: dict[str, Any], transition: dict[str, Any], wallet: str, token_mint: str,
) -> dict[str, Any]:
    result = funding_work.get("result") or {}
    signature = str(result.get("signature") or "")
    if not signature:
        raise ValueError("Cranker funding receipt is missing the transaction signature")
    transaction_result = await node.solana_rpc("getTransaction", [
        signature,
        {"encoding": "base64", "commitment": "confirmed", "maxSupportedTransactionVersion": 0},
    ])
    tx = transaction_result.get("result")
    if not isinstance(tx, dict) or tx.get("meta", {}).get("err") is not None:
        raise ValueError("TCAP deposit transaction is not confirmed successfully on Solana")
    accounts = transition.get("depositAccounts")
    if not isinstance(accounts, dict):
        raise ValueError("TCAP deposit account contract is missing")
    funding_payload = funding_work.get("payload") or {}
    signed_wire = str(funding_payload.get("senderSignedFundingTransaction") or "")
    node._verify_signed_tcap_deposit_contract(
        transaction_base64=signed_wire, transition=transition, wallet=wallet,
    )
    if accounts.get("depositor") != wallet or accounts.get("mint") != token_mint:
        raise ValueError("TCAP deposit owner or mint differs from the signed request")
    amount = int(str(transition.get("depositAmountBaseUnits") or "0"))
    if amount <= 0:
        raise ValueError("TCAP deposit amount must be positive")
    transaction = tx.get("transaction")
    if (not isinstance(transaction, list) or len(transaction) != 2 or transaction[1] != "base64"
            or not isinstance(transaction[0], str) or not hmac.compare_digest(transaction[0], signed_wire)):
        raise ValueError("Confirmed TCAP reserve deposit differs from the wallet-signed transaction")
    signed_bytes = base64.b64decode(signed_wire, validate=True)
    _, signature_offset = node._read_solana_shortvec(signed_bytes, 0)
    try:
        receipt_signature = node.decode_base58(signature)
    except ValueError as exc:
        raise ValueError("TCAP deposit signature does not match the Receiver funding receipt") from exc
    if not hmac.compare_digest(receipt_signature, signed_bytes[signature_offset:signature_offset + 64]):
        raise ValueError("TCAP deposit signature does not match the Receiver funding receipt")
    return {"signature": signature, "slot": int(tx.get("slot") or 0), "amountBaseUnits": str(amount), "mint": token_mint}
