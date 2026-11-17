from __future__ import annotations
from pydantic import BaseModel

class EpochCloseResult(BaseModel):
    epoch_number:     int
    intents_archived: int
    settlements_archived: int
    intents_rolled_over: int = 0
    intents_pruned:      int = 0
    settlements_pruned: int = 0
    github_commit_url: str
    new_epoch_number:  int
    message:           str
