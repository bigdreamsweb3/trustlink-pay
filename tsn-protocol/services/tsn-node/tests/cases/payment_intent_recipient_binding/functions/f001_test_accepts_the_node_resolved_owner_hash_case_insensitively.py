from server import _assert_recipient_hash_matches_owner

def test_accepts_the_node_resolved_owner_hash_case_insensitively(self):
    owner_hash = 'ab' * 32
    _assert_recipient_hash_matches_owner(owner_hash.upper(), owner_hash)
