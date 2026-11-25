async def process(node, client, headers, work):
    node.events.append("verify:" + work["id"])
    node.processed.append(work)
    if work["id"] == "expensive":
        node.expensive_started.set()
        await node.release_expensive.wait()
    if work["id"].startswith("funding"):
        node.funding_finished.set()
