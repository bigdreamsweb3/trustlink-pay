"""Fair signed-deposit priority, empty/idle queues and bounded cancellation/retry."""
import unittest
from cases.funding_queue.functions.test_fair_order import test_fair_order
from cases.funding_queue.functions.test_message_authorization import test_message_authorization
from cases.funding_queue.functions.test_fast_queue_drains import test_fast_queue_drains
from cases.funding_queue.functions.test_idle_wake import test_idle_wake
from cases.funding_queue.functions.test_failure_bound import test_failure_bound
from cases.funding_queue.functions.test_cancellation import test_cancellation
from cases.funding_queue.functions.test_funding_during_slow_work import test_funding_during_slow_work
from cases.funding_queue.functions.test_wake_before_epoch_close import test_wake_before_epoch_close


class FundingQueueTests(unittest.IsolatedAsyncioTestCase):
    test_fair_order = test_fair_order
    test_message_authorization = test_message_authorization
    test_fast_queue_drains = test_fast_queue_drains
    test_idle_wake = test_idle_wake
    test_failure_bound = test_failure_bound
    test_cancellation = test_cancellation
    test_funding_during_slow_work = test_funding_during_slow_work
    test_wake_before_epoch_close = test_wake_before_epoch_close
