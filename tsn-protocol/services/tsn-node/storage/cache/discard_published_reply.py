"""Remove only an acknowledged reply cache entry, after Receiver holds its verified durable result."""
from .cache_path import cache_path
from .dependencies import CacheDependencies


def discard_published_reply(node: CacheDependencies, identifier: str) -> None:
    cache_path(node, identifier).unlink(missing_ok=True)
