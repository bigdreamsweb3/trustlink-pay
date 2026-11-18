from .initialize import __init__
from .doc import _doc
from .item_doc import _item_doc
from .get import get
from .set import set
from .hget import hget
from .hgetall import hgetall
from .hlen import hlen
from .hset import hset
from .consume_once import consume_once
from storage.common.claim_once import claim_once
from .delete import delete
from .aclose import aclose

class FirebaseStore:
    'Firestore-backed store with the hash-like methods used by this API.'
    __init__ = __init__
    _doc = _doc
    _item_doc = _item_doc
    get = get
    set = set
    hget = hget
    hgetall = hgetall
    hlen = hlen
    hset = hset
    consume_once = consume_once
    claim_once = claim_once
    delete = delete
    aclose = aclose
