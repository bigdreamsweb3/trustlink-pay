"""Local loopback entrypoint for the TrustLink Labs TSN Node."""

import os

import uvicorn

from server import app

__all__ = ["app"]


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=int(os.environ.get("PORT", "8000")),
        reload=False,
    )
