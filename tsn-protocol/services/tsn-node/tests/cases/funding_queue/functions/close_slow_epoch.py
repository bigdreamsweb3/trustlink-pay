from types import SimpleNamespace


async def close_slow_epoch(node):
    node.expensive_started.set()
    await node.release_expensive.wait()
    return SimpleNamespace(message="synthetic close completed")
