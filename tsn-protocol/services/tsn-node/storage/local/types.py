from .initialize import __init__
from .read import _read
from .write import _write
from .get import get
from .set import set
from .hget import hget
from .hgetall import hgetall
from .hlen import hlen
from .hset import hset
from .consume_once import consume_once
from .delete import delete
from .aclose import aclose

class FileStore:
    'Local JSON-backed mempool store for devnet testing without Firebase quota.'
    __init__ = __init__
    _read = _read
    _write = _write
    get = get
    set = set
    hget = hget
    hgetall = hgetall
    hlen = hlen
    hset = hset
    consume_once = consume_once
    delete = delete
    aclose = aclose
