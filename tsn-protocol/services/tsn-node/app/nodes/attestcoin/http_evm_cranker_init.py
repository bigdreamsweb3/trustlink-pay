from __future__ import annotations



def __init__(self, endpoint: str, api_key: str | None = None) -> None:
    self.endpoint = endpoint.rstrip("/")
    self.api_key = api_key
