"""Canonical TIN-Debit statement and public execution fields."""
from pathlib import Path

FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617
ORDER = 2736030358979909402780800718157159386076813972158567259200215660948447373041
CIRCUIT = Path(__file__).resolve().parents[4] / "programs/gpru/circuits/hidden_head_tin_debit_v1"
PUBLIC_FIELDS = ("oldGlobalRoot", "newGlobalRoot", "tipRouteRoot", "rootSequence", "deploymentCommitment", "assetId", "validAfterSlot", "expiresAtSlot", "amountCommitment", "authorizationCommitment", "actionCommitment", "nullifier", "memoCommitments", "successorPortfolioRoots", "successorBalanceX", "successorBalanceY", "encryptedBlindingDeltas", "deltaEphemeralPublicX", "deltaEphemeralPublicY")
ACCOUNT_FIELDS = ("authority", "motherEscrow", "tcapProgram", "tsnProgram", "config", "assetEntry", "commitmentRoot", "reserveState", "authorizationSigner", "tipRouteRoot", "tinDebitVerifier", "instructions", "gpruProgram", "tipProgram")
TRANSITION_FIELDS = (*ACCOUNT_FIELDS, "proof", "memoPayloads", "authorizationDigest", "tokenId", "amountCommitment", "authorizationCommitment", "actionCommitment", "nullifier", "previousTcapRoot", "newTcapRoot", "tcapRootSequence", "validAfterSlot", "expiresAtSlot", "deploymentCommitment")
CONTEXT_FIELDS = ("tsnProgram", "tcapProgram", "gpruProgram", "tipProgram", "commitmentRoot", "assetEntry", "reserveState", "tipRouteRoot", "tinDebitVerifier")
