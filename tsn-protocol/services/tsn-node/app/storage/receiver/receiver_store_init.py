from __future__ import annotations

import httpx

def __init__(self, base_url: str, api_key: str, fallback_url: str | None = None):
    if not base_url or not api_key:
        raise RuntimeError("TSN Receiver URL and Node API key are required")
    urls = [base_url, fallback_url] if fallback_url else [base_url]
    urls = [url.strip().strip('"').strip("'").strip() for url in urls if url]
    self.endpoints = [f"{url.rstrip('/')}/api/internal/node/state" for url in urls if url]
    self.headers = {"x-api-key": api_key.strip().strip('"').strip("'"), "content-type": "application/json"}
    self.client = httpx.AsyncClient(timeout=20)
