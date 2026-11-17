

def callback(b):
    return len(b).to_bytes(4, 'little') + b
