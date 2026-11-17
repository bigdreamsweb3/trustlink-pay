from cases.private_credit_coordination.functions.f010_rpc import rpc as _case_f010_rpc
from functools import partial

def signing_rpc(self, fixture, latest=None, validity=True, validity_context=None):
    _, _, _, _, fresh, _, _ = fixture
    rpc = partial(_case_f010_rpc, fresh, latest, self, validity, validity_context)
    return rpc
