"""_simulate_owner_signed_tcap_deposit: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import HTTPException
from typing import Any
import base64
import binascii
import httpx
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_SOLANA_RPC_URLS: Any


async def _simulate_owner_signed_tcap_deposit(node: Dependencies, transaction_base64: str) -> dict[str, Any]:
    """Ask the configured Solana program to validate the exact signed deposit without submitting it."""
    try:
        wire = base64.b64decode(transaction_base64, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("Owner-signed TCAP deposit transaction is not valid base64") from exc
    if not wire or base64.b64encode(wire).decode("ascii") != transaction_base64:
        raise ValueError("Owner-signed TCAP deposit transaction encoding is invalid")
    params = [
        base64.b64encode(wire).decode("ascii"),
        {
            "encoding": "base64",
            "commitment": "confirmed",
            "sigVerify": True,
            "replaceRecentBlockhash": False,
        },
    ]
    last_blockhash_error: Any = None
    last_rpc_error: Exception | None = None
    async with httpx.AsyncClient(timeout=12) as client:
        for rpc_url in node.TSN_SOLANA_RPC_URLS:
            try:
                response = await client.post(rpc_url, json={
                    "jsonrpc": "2.0", "id": 1, "method": "simulateTransaction", "params": params,
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
            value = ((rpc_response.get("result") or {}).get("value"))
            if not isinstance(value, dict) or "err" not in value:
                last_rpc_error = ValueError("Solana RPC returned no TCAP deposit simulation result")
                continue
            simulation_error = value.get("err")
            blockhash_not_found = (
                simulation_error == "BlockhashNotFound"
                or isinstance(simulation_error, dict) and "BlockhashNotFound" in simulation_error
            )
            if blockhash_not_found:
                last_blockhash_error = simulation_error
                continue
            if simulation_error is not None:
                logs = value.get("logs") or []
                detail = "; ".join(str(line) for line in logs[-8:])
                raise ValueError(f"Deployed TCAP program rejected the signed deposit during simulation: {detail or simulation_error}")
            return {
                "programSimulation": "PASSED",
                "computeUnitsConsumed": value.get("units"),
            }
    if last_blockhash_error is not None and last_rpc_error is None:
        raise ValueError("Signed deposit blockhash was not recognized by any configured Solana RPC endpoint; prepare and sign a fresh deposit transaction")
    raise HTTPException(503, "Solana RPC is unavailable while simulating the signed TCAP deposit") from last_rpc_error
