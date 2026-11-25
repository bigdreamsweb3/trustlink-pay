import unittest
from cases.local_node.set_up import set_up
from cases.local_node.tear_down import tear_down
from cases.local_node.test_encrypted_restart import test_encrypted_restart
from cases.local_node.test_unknown_execution import test_unknown_execution
from cases.local_node.test_hash_and_path_validation import test_hash_and_path_validation
from cases.local_node.test_reply_binding import test_reply_binding
from cases.local_node.test_publish_retry import test_publish_retry
from cases.local_node.test_loopback_only import test_loopback_only
from cases.local_node.test_lease_loss import test_lease_loss
from cases.local_node.test_cache_corruption import test_cache_corruption
from cases.local_node.test_resource_arguments import test_resource_arguments

from cases.local_node.test_cursor_recovery import test_cursor_recovery

class LocalNodeTests(unittest.IsolatedAsyncioTestCase):
    setUp = set_up
    tearDown = tear_down
    test_encrypted_restart = test_encrypted_restart
    test_unknown_execution = test_unknown_execution
    test_hash_and_path_validation = test_hash_and_path_validation
    test_reply_binding = test_reply_binding
    test_publish_retry = test_publish_retry
    test_loopback_only = test_loopback_only
    test_lease_loss = test_lease_loss
    test_cache_corruption = test_cache_corruption
    test_resource_arguments = test_resource_arguments
    test_cursor_recovery = test_cursor_recovery
