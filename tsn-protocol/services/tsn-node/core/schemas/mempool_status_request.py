from __future__ import annotations
from pydantic import BaseModel
from pydantic import Field
from typing import Optional

class MempoolStatusRequest(BaseModel):
    action: Optional[str] = Field(default="status")
