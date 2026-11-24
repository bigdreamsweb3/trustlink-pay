"""Emit only synthetic circuit cases over stdout to the offline test process."""
import json
from fixtures import circuit_cases


def decimal_strings(value):
    if type(value) is int:
        return str(value)
    if isinstance(value, list):
        return [decimal_strings(item) for item in value]
    if isinstance(value, dict):
        return {key: decimal_strings(item) for key, item in value.items()}
    return value


if __name__ == "__main__":
    print(json.dumps(decimal_strings(circuit_cases()), separators=(",", ":")))
