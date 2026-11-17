from app.services.tcap_snapshot_store import EncryptedTcapSnapshotEnvelope
from app.services.tcap_snapshot_store import FileTcapSnapshotStore
from pathlib import Path
import asyncio
from cases.tcap_snapshot_and_credit_handoff.functions.f002_run import run as _case_f002_run
from functools import partial

def test_snapshot_store_round_trip_is_opaque(tmp_path: Path):
    run = partial(_case_f002_run, tmp_path)
    asyncio.run(run())
