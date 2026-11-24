"""Canonical private preparation constants and cryptographic scalar pins."""
from security.cryptography.gpru_contract import BABYJUB_SUBORDER

MAX_U64 = (1 << 64) - 1
MAX_BALANCE = (1 << 128) - 1
ACTION_KIND = 4
VALUE_DOMAIN = int.from_bytes(b"TSN_TIN_DEBIT_VALUE_V1", "big")
NULLIFIER_DOMAIN = int.from_bytes(b"TSN_TIN_DEBIT_NULLIFIER_V1", "big")
AUTH_DOMAIN = int.from_bytes(b"TSN_TIN_DEBIT_AUTH_V1", "big")
CONTEXT_DOMAIN = int.from_bytes(b"TSN_TIN_DEBIT_CONTEXT_V1", "big")
SIGNATURE_DOMAIN = b"TSN_TIN_DEBIT_APPROVAL_V1\0"
PUBLIC_FIELDS = (
    "oldGlobalRoot", "newGlobalRoot", "tipRouteRoot", "rootSequence",
    "deploymentCommitment", "assetId", "validAfterSlot", "expiresAtSlot",
    "amountCommitment", "authorizationCommitment", "actionCommitment", "nullifier",
    "memoCommitments", "successorPortfolioRoots", "successorBalanceX", "successorBalanceY",
    "encryptedBlindingDeltas", "deltaEphemeralPublicX", "deltaEphemeralPublicY",
)
RESERVE_CATEGORIES = (
    "pendingLiabilities", "settledConfidentialLiabilities",
    "authorizedWithdrawalLiabilities", "reservedRefundLiabilities", "transferPending",
)
OPENING_DOMAIN = b"TSN_TIN_DEBIT_OPENING_V1\0"
OPENING_FIELDS = (
    "leg", "authorizationCommitment",
    "routeKeyCommitment", "tokenId", "sequence", "previousMemoCommitment", "balance", "blinding",
)
OPENING_TAG = {"version": 1, "recordType": "tsn-gpru-tin-debit-opening-v1"}
