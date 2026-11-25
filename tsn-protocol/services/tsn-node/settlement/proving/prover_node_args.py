"""Bound the child JavaScript heap; WASM/native allocations remain separate and are not an RSS guarantee."""
import os


def prover_node_args() -> list[str]:
    try:
        memory = int(os.environ.get("TSN_PROVER_HEAP_MB", "2048"))
    except ValueError as exc:
        raise ValueError("TSN_PROVER_HEAP_INVALID") from exc
    if not 512 <= memory <= 4096:
        raise ValueError("TSN_PROVER_HEAP_INVALID")
    return [os.environ.get("GPRU_NODE_EXECUTABLE", "node"), f"--max-old-space-size={memory}"]
