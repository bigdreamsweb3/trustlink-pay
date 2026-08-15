"""Wasmer Edge entrypoint for the TrustLink Labs TSN Node."""

import os

import uvicorn

from server import app

__all__ = ["app"]


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8000")),
        reload=False,
    )
