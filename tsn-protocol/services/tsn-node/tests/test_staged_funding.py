"""Staged intent authorization, private readiness, nonce ownership and exact attachment."""
import unittest
from cases.wallet_funding_transaction.functions.f013_setUp import setUp
from cases.staged_funding.functions.test_initial_schema import test_initial_schema
from cases.staged_funding.functions.test_nonce_binding import test_nonce_binding
from cases.staged_funding.functions.test_authorization_readiness import test_authorization_readiness
from cases.staged_funding.functions.test_readiness_integrity import test_readiness_integrity
from cases.staged_funding.functions.test_owner_readiness import test_owner_readiness
from cases.staged_funding.functions.test_completion_retry_and_fences import test_completion_retry_and_fences
from cases.staged_funding.functions.test_deposit_account_preflight import test_deposit_account_preflight
from cases.staged_funding.functions.test_funding_route_privacy import test_funding_route_privacy


class StagedFundingTests(unittest.IsolatedAsyncioTestCase):
    setUp = setUp
    test_initial_schema = test_initial_schema
    test_nonce_binding = test_nonce_binding
    test_authorization_readiness = test_authorization_readiness
    test_readiness_integrity = test_readiness_integrity
    test_owner_readiness = test_owner_readiness
    test_completion_retry_and_fences = test_completion_retry_and_fences
    test_deposit_account_preflight = test_deposit_account_preflight
    test_funding_route_privacy = test_funding_route_privacy
