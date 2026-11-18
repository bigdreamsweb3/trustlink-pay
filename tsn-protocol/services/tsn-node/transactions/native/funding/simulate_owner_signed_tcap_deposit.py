"""_simulate_owner_signed_tcap_deposit: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import HTTPException
from typing import Any
import base64
import binascii
import hashlib
import httpx
from typing import Any, Callable, Protocol
from .funding_blockhash_context import _funding_blockhash_context
from .funding_blockhash_bank_height import _funding_blockhash_bank_height
from app.solana_pubkey import Pubkey

class Dependencies(Protocol):
    TSN_SOLANA_RPC_URLS: Any
    logger: Any
    _read_solana_shortvec: Callable[..., Any]


async def _simulate_owner_signed_tcap_deposit(node: Dependencies, transaction_base64: str, blockhash_context: dict[str, Any]) -> dict[str, Any]:
    """Ask the configured Solana program to validate the exact signed deposit without submitting it."""
    try:
        wire = base64.b64decode(transaction_base64, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("Owner-signed TCAP deposit transaction is not valid base64") from exc
    if not wire or base64.b64encode(wire).decode("ascii") != transaction_base64:
        raise ValueError("Owner-signed TCAP deposit transaction encoding is invalid")
    context = _funding_blockhash_context(node, transaction_base64, blockhash_context)
    fingerprint = hashlib.sha256(bytes(Pubkey.from_string(context["blockhash"]))).hexdigest()[:16]
    node.logger.info("TCAP funding simulation hashFingerprint=%s minContextSlot=%s reportedLastValidBlockHeight=%s",
                     fingerprint, context["contextSlot"], context["lastValidBlockHeight"])
    params = [
        base64.b64encode(wire).decode("ascii"),
        {
            "encoding": "base64",
            "commitment": "confirmed",
            "sigVerify": True,
            "replaceRecentBlockhash": False,
            "minContextSlot": context["contextSlot"],
        },
    ]
    last_blockhash_error: Any = None
    last_rpc_error: Exception | None = None
    async with httpx.AsyncClient(timeout=12) as client:
        for rpc_url in node.TSN_SOLANA_RPC_URLS:
            try:
                response = await client.post(rpc_url, json={
                    "jsonrpc": "2.0", "id": "funding-simulation-" + fingerprint, "method": "simulateTransaction", "params": params,
                })
                response.raise_for_status()
                rpc_response = response.json()
            except (httpx.HTTPError, ValueError) as exc:
                last_rpc_error = exc
                continue
            if not isinstance(rpc_response, dict):
                last_rpc_error = ValueError("Solana RPC returned an invalid TCAP deposit response")
                continue
            if rpc_response.get("error"):
                last_rpc_error = RuntimeError(str(rpc_response["error"]))
                continue
            result = rpc_response.get("result")
            value = result.get("value") if isinstance(result, dict) else None
            if not isinstance(value, dict) or "err" not in value:
                last_rpc_error = ValueError("Solana RPC returned no TCAP deposit simulation result")
                continue
            result_context = result.get("context") or {}
            simulation_slot = result_context.get("slot") if isinstance(result_context, dict) else None
            if type(simulation_slot) is not int or not context["contextSlot"] <= simulation_slot <= 9007199254740991:
                last_rpc_error = ValueError("Funding simulation bank is below its required context")
                continue
            simulation_error = value.get("err")
            blockhash_not_found = (
                simulation_error == "BlockhashNotFound"
                or isinstance(simulation_error, dict) and "BlockhashNotFound" in simulation_error
            )
            if blockhash_not_found:
                last_blockhash_error = simulation_error
                try:
                    height = await _funding_blockhash_bank_height(client, rpc_url, context["contextSlot"])
                except (httpx.HTTPError, ValueError) as exc:
                    last_rpc_error = exc
                    continue
                node.logger.warning("TCAP funding hash unavailable hashFingerprint=%s simulationContextSlot=%s observedBlockHeight=%s reportedLastValidBlockHeight=%s",
                                    fingerprint, simulation_slot, height, context["lastValidBlockHeight"])
                if height <= context["lastValidBlockHeight"]:
                    last_rpc_error = RuntimeError("Funding hash is unavailable within its client-reported lifetime")
                continue
            if simulation_error is not None:
                logs = value.get("logs") or []
                detail = "; ".join(str(line) for line in logs[-8:])
                raise ValueError(f"Deployed TCAP program rejected the signed deposit during simulation: {detail or simulation_error}")
            return {
                "programSimulation": "PASSED",
                "computeUnitsConsumed": value.get("units"),
                "blockhashFingerprint": fingerprint,
                "blockhashContextSlot": context["contextSlot"],
                "simulationContextSlot": simulation_slot,
                "reportedLastValidBlockHeight": context["lastValidBlockHeight"],
            }
    if last_blockhash_error is not None and last_rpc_error is None:
        raise ValueError("Signed deposit blockhash was rejected by every configured Solana RPC bank after its reported lifetime; inspect the original work/signature, then prepare and sign a fresh deposit transaction")
    raise HTTPException(503, "Solana RPC is unavailable while simulating the signed TCAP deposit") from last_rpc_error
