from __future__ import annotations
from storage.common.claim_once import claim_once

from .file_store_init import __init__ as _FileStore_init
from .file_store_read import _read as _FileStore_read
from .file_store_write import _write as _FileStore_write
from .file_store_get import get as _FileStore_get
from .file_store_set import set as _FileStore_set
from .file_store_hget import hget as _FileStore_hget
from .file_store_hgetall import hgetall as _FileStore_hgetall
from .file_store_hlen import hlen as _FileStore_hlen
from .file_store_hset import hset as _FileStore_hset
from .file_store_consume_once import consume_once as _FileStore_consume_once
from .file_store_delete import delete as _FileStore_delete
from .file_store_aclose import aclose as _FileStore_aclose

class FileStore:
    """Local JSON-backed mempool store for isolated devnet testing."""
    __init__ = _FileStore_init
    _read = _FileStore_read
    _write = _FileStore_write
    get = _FileStore_get
    set = _FileStore_set
    hget = _FileStore_hget
    hgetall = _FileStore_hgetall
    hlen = _FileStore_hlen
    hset = _FileStore_hset
    consume_once = _FileStore_consume_once
    claim_once = claim_once
    delete = _FileStore_delete
    aclose = _FileStore_aclose
