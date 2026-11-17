from cases.tip_snapshot_sync.data import sync

def test_wrong_append_order_count_or_base_is_rejected(self):
    for base, leaves, root, count in ((self.base, [self.first], self.root, 2), (self.base, [self.second], self.root, 3), (self.root, [self.second], self.root, 2), (self.base, [self.second], self.base, 2)):
        with self.subTest(count=count, root=root), self.assertRaises(ValueError):
            sync.extend_snapshot(self.snapshot, base, leaves, root, count)
