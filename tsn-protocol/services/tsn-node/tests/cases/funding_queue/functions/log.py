def log(node, message, *args):
    if "sleeping; waiting for wake" in message:
        node.idle.set()
    if "drained queue" in message or "returning to sleep" in message:
        node.settled.set()
