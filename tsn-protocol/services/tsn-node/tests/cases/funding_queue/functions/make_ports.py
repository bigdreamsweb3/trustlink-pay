from collections import deque
from functools import partial
from types import SimpleNamespace
import asyncio
from unittest.mock import Mock, AsyncMock
from .request import request
from .process import process
from .coordinate import coordinate
from .log import log


def make_ports(fast=(), normal=(), authorization=(), failure=None):
    node = SimpleNamespace(TSN_NODE_ID="synthetic-node", TSN_RECEIVER_NODE_API_KEY="synthetic-api-key",
                           TSN_LOCAL_FLOW_LOGS=True, _private_coordination_pending=False,
                           _receiver_wake_event=asyncio.Event(), _receiver_funding_wake_event=asyncio.Event(), settled=asyncio.Event(), idle=asyncio.Event(),
                           fast=deque(fast), normal=deque(normal), authorization=deque(authorization), failure=failure,
                           expensive_started=asyncio.Event(), release_expensive=asyncio.Event(), funding_finished=asyncio.Event(), events=[], processed=[], requests=[])
    node.cache_receiver_work = AsyncMock()
    node.receiver_request = partial(request, node)
    node._process_receiver_work_with_lease = partial(process, node)
    node._coordinate_private_credit_work = partial(coordinate, node)
    node.logger = SimpleNamespace(info=partial(log, node), error=partial(log, node), exception=Mock())
    return node
