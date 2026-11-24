"""Encode private witness scalars canonically for the bounded prover pipe."""


def witness_strings(value):
    if type(value) is int:
        return str(value)
    if isinstance(value, list):
        return [witness_strings(child) for child in value]
    if isinstance(value, dict):
        return {name: witness_strings(child) for name, child in value.items()}
    return value
