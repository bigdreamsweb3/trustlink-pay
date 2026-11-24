"""TIN-Debit authorization and cross-language wire regression discovery."""
import unittest
from cases.tin_debit.test_wire import test_wire


class TinDebitTests(unittest.TestCase):
    test_wire = test_wire

from cases.tin_debit.test_prepare_authorization import test_prepare_authorization
from cases.tin_debit.test_deposit_independence import test_deposit_independence
from cases.tin_debit.test_ingress_retry import test_ingress_retry


class TinDebitApiTests(unittest.IsolatedAsyncioTestCase):
    test_prepare_authorization = test_prepare_authorization
    test_deposit_independence = test_deposit_independence
    test_ingress_retry = test_ingress_retry
