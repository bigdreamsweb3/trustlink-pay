from __future__ import annotations

from .firebase_store_init import __init__ as _FirebaseStore_init
from .firebase_store_doc import _doc as _FirebaseStore_doc
from .firebase_store_item_doc import _item_doc as _FirebaseStore_item_doc
from .firebase_store_get import get as _FirebaseStore_get
from .firebase_store_set import set as _FirebaseStore_set
from .firebase_store_hget import hget as _FirebaseStore_hget
from .firebase_store_read_document import _read_document as _FirebaseStore_read_document
from .firebase_store_write_document import _write_document as _FirebaseStore_write_document
from .firebase_store_read_item import _read_item as _FirebaseStore_read_item
from .firebase_store_write_item import _write_item as _FirebaseStore_write_item
from .firebase_store_read_items import _read_items as _FirebaseStore_read_items
from .firebase_store_hgetall import hgetall as _FirebaseStore_hgetall
from .firebase_store_hlen import hlen as _FirebaseStore_hlen
from .firebase_store_write_mapping import _write_mapping as _FirebaseStore_write_mapping
from .firebase_store_hset import hset as _FirebaseStore_hset
from .firebase_store_consume_transaction import _consume_transaction as _FirebaseStore_consume_transaction
from .firebase_store_consume import _consume as _FirebaseStore_consume
from .firebase_store_consume_once import consume_once as _FirebaseStore_consume_once
from .firebase_store_delete_keys import _delete_keys as _FirebaseStore_delete_keys
from .firebase_store_delete import delete as _FirebaseStore_delete
from .firebase_store_aclose import aclose as _FirebaseStore_aclose
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

class FirebaseStore:
    """Firestore-backed store with the hash-like methods used by this API."""
    __init__ = _FirebaseStore_init
    _doc = _FirebaseStore_doc
    _item_doc = _FirebaseStore_item_doc
    get = _FirebaseStore_get
    set = _FirebaseStore_set
    hget = _FirebaseStore_hget
    _read_document = _FirebaseStore_read_document
    _write_document = _FirebaseStore_write_document
    _read_item = _FirebaseStore_read_item
    _write_item = _FirebaseStore_write_item
    _read_items = _FirebaseStore_read_items
    hgetall = _FirebaseStore_hgetall
    hlen = _FirebaseStore_hlen
    _write_mapping = _FirebaseStore_write_mapping
    hset = _FirebaseStore_hset
    _consume_transaction = _FirebaseStore_consume_transaction
    _consume = _FirebaseStore_consume
    consume_once = _FirebaseStore_consume_once
    _delete_keys = _FirebaseStore_delete_keys
    delete = _FirebaseStore_delete
    aclose = _FirebaseStore_aclose

class FileStore:
    """Local JSON-backed mempool store for devnet testing without Firebase quota."""
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
    delete = _FileStore_delete
    aclose = _FileStore_aclose
