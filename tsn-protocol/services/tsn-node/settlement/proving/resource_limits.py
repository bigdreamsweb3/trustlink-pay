"""One shared prover budget across credit, debit and accounting; no request can change these resources."""
import asyncio

LOCAL_PROVER_LOCK = asyncio.Lock()
