from cases.tip_snapshot_auto_sync.data import ROOTS
from tip_snapshot_sync import ROOT_BUMP
from tip_snapshot_sync import ROUTE_ROOT
from tip_snapshot_sync import TIP
import copy

async def rpc(self, method, params):
    import base64
    self.calls.append((method, copy.deepcopy(params)))
    if method == 'getMultipleAccounts':
        values = []
        for address in params[0]:
            if address == str(ROUTE_ROOT):
                self.root_reads += 1
                count = 2 if self.root_changed and self.root_reads > 1 else 3
                data = bytes([1, ROOT_BUMP]) + bytes.fromhex(ROOTS[count - 1]) + count.to_bytes(8, 'little') + bytes(1024)
            else:
                data = self.accounts[address]
            values.append({'owner': str(TIP), 'executable': False, 'data': [base64.b64encode(data).decode(), 'base64']})
        return {'result': {'context': {'slot': 101}, 'value': values}}
    if method == 'getSignaturesForAddress':
        self.assertEqual(len(params), 2)
        self.assertEqual(params[1]['commitment'], 'confirmed')
        self.assertEqual(params[1]['minContextSlot'], 101)
        return {'result': [] if 'before' in params[1] else self.entries}
    if method == 'getTransaction':
        return {'result': self.receipts.get(params[0])}
    raise AssertionError(method)
