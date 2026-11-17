from __future__ import annotations

from .receiver_store_init import __init__ as _ReceiverStore_init
from .receiver_store_call import _call as _ReceiverStore_call
from .receiver_store_get import get as _ReceiverStore_get
from .receiver_store_set import set as _ReceiverStore_set
from .receiver_store_hget import hget as _ReceiverStore_hget
from .receiver_store_hgetall import hgetall as _ReceiverStore_hgetall
from .receiver_store_hlen import hlen as _ReceiverStore_hlen
from .receiver_store_hset import hset as _ReceiverStore_hset
from .receiver_store_consume_once import consume_once as _ReceiverStore_consume_once
from .receiver_store_delete import delete as _ReceiverStore_delete
from .receiver_store_aclose import aclose as _ReceiverStore_aclose

class ReceiverStore:
    """Remote durable-state adapter. The TSN Node retains no queue database."""
    __init__ = _ReceiverStore_init
    _call = _ReceiverStore_call
    get = _ReceiverStore_get
    set = _ReceiverStore_set
    hget = _ReceiverStore_hget
    hgetall = _ReceiverStore_hgetall
    hlen = _ReceiverStore_hlen
    hset = _ReceiverStore_hset
    consume_once = _ReceiverStore_consume_once
    delete = _ReceiverStore_delete
    aclose = _ReceiverStore_aclose
