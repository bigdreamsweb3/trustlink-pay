async def process(node, client, headers, work):
    node.events.append("verify:" + work["id"])
    node.processed.append(work)
