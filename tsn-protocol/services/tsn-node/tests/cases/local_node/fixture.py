"""Synthetic keys and isolated local storage; no operator configuration or Receiver is used."""
import asyncio
import hashlib
import json
from functools import partial
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from nacl.signing import SigningKey
from fastapi import FastAPI
from core.relay.dispatch_relay_job import dispatch_relay_job
from core.relay.execute_relay_job import execute_relay_job
from .reply_handler import reply_handler


def fixture(directory) -> SimpleNamespace:
    node = SimpleNamespace(LOCAL_NODE_CACHE_DIR=Path(directory), TSN_RECEIVER_URL="https://receiver.invalid",
        TSN_RECEIVER_NODE_API_KEY="synthetic-service-key", TSN_NODE_ID="local-node", _local_cache_lock=asyncio.Lock(),
        _node_verification_signing_key=Mock(return_value=SigningKey(b"A" * 32)), logger=Mock())
    app = FastAPI()
    app.post("/network/funding/readiness")(reply_handler)
    node._relay_app = app
    node.dispatch_relay_job = AsyncMock(wraps=partial(dispatch_relay_job, node))
    node.execute_relay_job = partial(execute_relay_job, node)
    request = {"method": "POST", "path": "/network/funding/readiness", "search": "", "headers": {"authorization": "synthetic-owner-approval"}, "body": '{"value":"synthetic-private-value"}'}
    node.job = {"id": "12" * 32, "version": 2, "request": request,
        "requestHash": hashlib.sha256(json.dumps(request, sort_keys=True, separators=(",", ":")).encode("utf8")).hexdigest()}
    return node
