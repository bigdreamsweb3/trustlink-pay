from cases.tip_snapshot_auto_sync.data import ROOTS
from tip_snapshot_sync import ensure_tip_snapshot
from cases.tip_snapshot_auto_sync.functions.f012_paginated import paginated as _case_f012_paginated
from functools import partial

async def test_multiple_new_tins_and_paginated_history(self):
    self.seed(1)
    original = self.rpc
    first = self.entries[:1]
    remaining = self.entries[1:]
    paginated = partial(_case_f012_paginated, first, original, remaining)
    await ensure_tip_snapshot(self.directory, ROOTS[2], paginated)
    self.assert_current_snapshot()
