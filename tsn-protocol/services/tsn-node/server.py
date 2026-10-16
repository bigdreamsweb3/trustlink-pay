from __future__ import annotations

"""
TSN Shared Mempool â€” self-hosted version.

Requirements:
    npm run tsn:mempool:install

    Or directly:
    python -m pip install -r tsn-protocol/services/tsn-node/requirements.txt

Environment variables (create a .env file):
    GITHUB_TOKEN=<your GitHub PAT with Contents:Write on tsn-epoch-records>
    FIREBASE_PROJECT_ID=<firebase project id>
    FIREBASE_CLIENT_EMAIL=<firebase admin client email>
    FIREBASE_PRIVATE_KEY=<firebase admin private key>
    PORT=8000
    EPOCH_HOURS=7
"""

import asyncio
import base64
import binascii
import glob
import hashlib
import hmac
import json
import logging
import math
import os
import re
import secrets
import struct
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Literal, Optional
from uuid import uuid4

import httpx
import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Path as ApiPath, Query
from fastapi.middleware.cors import CORSMiddleware
from nacl.exceptions import BadSignatureError, CryptoError
from nacl.public import Box, PrivateKey, PublicKey as Curve25519PublicKey
from nacl.signing import SigningKey, VerifyKey
from pydantic import BaseModel, ConfigDict, Field
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag
from app.solana_pubkey import Pubkey
from app.services.threshold_access import (
    ThresholdAccessError,
    create_signed_nonce_receipt,
    nonce_storage_key,
    threshold_request_commitment,
    verify_threshold_access_request,
)
from app.receiver_store import ReceiverStore
from app.services.route_attestation import (
    canonical_route_amount,
    canonical_route_message,
    sign_route_message,
)
from app.services.cross_chain_routes import (
    ready_destination_networks,
    verify_destination_route,
)

_node_root = Path(__file__).resolve().parent
# Local development is local-first. The hosted .env remains a fallback for
# values that are not present in the ignored .env.local file.
load_dotenv(_node_root / ".env.local", override=False)
load_dotenv(_node_root / ".env", override=False)


def clean_env(value: str | None, default: str = "") -> str:
    return (value if value is not None else default).strip().strip('"').strip("'").strip()

# â”€â”€ Logging â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("tsn-mempool")

# â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GITHUB_REPO     = "bigdreamsweb3/tsn-epoch-records"
GITHUB_API      = "https://api.github.com"
MEMPOOL_STORE   = os.environ.get("MEMPOOL_STORE", "firebase").strip().lower()
ALLOW_LOCAL_JSON_STORE = os.environ.get("TSN_ALLOW_LOCAL_JSON_STORE", "").strip().lower() == "true"
TSN_RECEIVER_URL = clean_env(os.environ.get(
    "TSN_RECEIVER_URL",
    "https://tsn-receiver-kappa.vercel.app",
))
TSN_RECEIVER_FALLBACK_URL = clean_env(os.environ.get(
    "TSN_RECEIVER_FALLBACK_URL",
    "https://tsn-receiver-kappa.vercel.app",
))
TSN_RECEIVER_NODE_API_KEY = clean_env(os.environ.get("TSN_RECEIVER_NODE_API_KEY"))
TSN_MOTHER_AUTHORITY_KEYPAIR_PATH = clean_env(os.environ.get("TSN_MOTHER_AUTHORITY_KEYPAIR_PATH"))
TSN_NODE_ID = clean_env(os.environ.get("TSN_NODE_ID", "tsn-node-local"))
TSN_NODE_VERIFICATION_SIGNING_KEY = clean_env(os.environ.get("TSN_NODE_VERIFICATION_SIGNING_KEY"))
TSN_LOCAL_FLOW_LOGS = os.environ.get("TSN_LOCAL_FLOW_LOGS", "").strip().lower() in {"1", "true", "yes", "on"} or TSN_NODE_ID == "tsn-node-local"
# The Receiver wakes this event after durable work is committed. The Node does
# not poll while the event is clear; it only drains the authenticated queue
# after a wake notification (or once at startup for already queued work).
_receiver_wake_event: asyncio.Event | None = None
ALLOW_DIRECT_FIREBASE_STORE = os.environ.get("TSN_ALLOW_DIRECT_FIREBASE_STORE", "").strip().lower() == "true"
MEMPOOL_FILE    = Path(os.environ.get("MEMPOOL_FILE", ".mempool-store.json")).resolve()
FIREBASE_COLLECTION = os.environ.get("FIREBASE_COLLECTION", "tsn_mempool").strip()
TSN_PROGRAM_ID  = os.environ.get("TSN_PROGRAM_ID") or os.environ.get("PROGRAM_ID") or "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V"
TINS_PROGRAM_ID = os.environ.get("TINS_PROGRAM_ID", "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT")
TCAP_PROGRAM_ID = os.environ.get("TCAP_PROGRAM_ID", "tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF")
TINS_PROGRAM_SALT = b"TINS_SALT_2026"
TINS_LOOKUP_SECRET = clean_env(os.environ.get("TINS_LOOKUP_SECRET"))
MEMPOOL_API_KEY  = os.environ.get("MEMPOOL_API_KEY", "").strip()
TSN_SETTLEMENT_AUTHORIZATION_SIGNING_KEY = os.environ.get(
    "TSN_SETTLEMENT_AUTHORIZATION_SIGNING_KEY", ""
).strip()
TSN_THRESHOLD_NONCE_SIGNING_KEY = os.environ.get(
    "TSN_THRESHOLD_NONCE_SIGNING_KEY",
    "",
).strip()
TSN_ROUTE_ATTESTATION_SIGNING_KEY = os.environ.get(
    "TSN_ROUTE_ATTESTATION_SIGNING_KEY",
    "",
).strip()
EPOCH_HOURS     = int(os.environ.get("EPOCH_HOURS", "7"))
EPOCH_SECS      = EPOCH_HOURS * 60 * 60
VAULT_LIQUIDITY_REFRESH_SECS = max(60, int(os.environ.get("VAULT_LIQUIDITY_REFRESH_SECS", str(EPOCH_SECS))))
HOST            = os.environ.get("HOST", "0.0.0.0").strip()
PORT            = int(os.environ.get("PORT", "8000"))
MEMPOOL_NS      = "tsn"
CRANKER_HEARTBEAT_TTL_SECS = int(os.environ.get("CRANKER_HEARTBEAT_TTL_SECS", "30"))
DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
CRANKER_VAULT_ACCOUNT_SIZE = 178
CRANKER_VAULT_DISCRIMINATOR = hashlib.sha256(b"account:CrankerVault").digest()[:8]
BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_vault_liquidity_cache: Optional[dict[str, Any]] = None
_vault_liquidity_lock = asyncio.Lock()


TSN_RPC_GATEWAY_URL = clean_env(
    os.environ.get("TSN_RPC_URL") or os.environ.get("TSN_RPC_GATEWAY_URL"),
    "https://tsn-rpc-gateway.vercel.app",
).rstrip("/")
TSN_SOLANA_RPC_URLS = list(dict.fromkeys((
    TSN_RPC_GATEWAY_URL,
    "https://api.devnet.solana.com",
)))
TSN_SOLANA_RPC_URL = TSN_SOLANA_RPC_URLS[0]


def receiver_endpoints(path: str) -> list[str]:
    return list(dict.fromkeys(
        f"{base.rstrip('/')}/{path.lstrip('/')}"
        for base in (TSN_RECEIVER_URL, TSN_RECEIVER_FALLBACK_URL)
        if base
    ))


async def receiver_request(client: httpx.AsyncClient, method: str, path: str, **kwargs: Any) -> httpx.Response:
    last_error: Exception | None = None
    for endpoint in receiver_endpoints(path):
        try:
            response = await client.request(method, endpoint, **kwargs)
            if response.status_code < 500:
                return response
            last_error = RuntimeError(f"TSN Receiver returned {response.status_code}")
        except httpx.RequestError as error:
            last_error = error
    raise RuntimeError("TSN Receiver unavailable on all configured endpoints") from last_error

TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
ASSOCIATED_TOKEN_PROGRAM_ID = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
PRIVATE_PAYOUT_DOMAIN = b"TSN_PRIVATE_SLOT_SETTLEMENT_V1"
PRIVATE_REFUND_DOMAIN = b"TSN_PRIVATE_SLOT_REFUND_V1"
MEMPOOL_LEASE_DOMAIN = "TSN_MEMPOOL_LEASE_V1"
PERMIT_TTL_SECS = max(15, int(os.environ.get("TSN_PRIVATE_PERMIT_TTL_SECS", "90")))
TSN_NODE_CLAIM_SLOT_HMAC_SECRET = os.environ.get("TSN_NODE_CLAIM_SLOT_HMAC_SECRET", "").strip()
LEASE_AUTH_MAX_AGE_SECS = max(15, int(os.environ.get("TSN_LEASE_AUTH_MAX_AGE_SECS", "60")))

TERMINAL_INTENT_STATUSES = {
    "executed",
    "settled",
    "completed",
    "failed",
    "canceled",
    "cancelled",
    "expired",
    "reverted",
}
def get_supported_token_mints() -> set[str]:
    raw = os.environ.get("SOLANA_ALLOWED_SPL_TOKENS", "").strip()
    if not raw:
        return {DEVNET_USDC_MINT}
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            return {DEVNET_USDC_MINT}
        mints = {
            str(token.get("mintAddress", "")).strip()
            for token in parsed
            if isinstance(token, dict) and str(token.get("mintAddress", "")).strip()
        }
        return mints or {DEVNET_USDC_MINT}
    except json.JSONDecodeError:
        logger.warning("SOLANA_ALLOWED_SPL_TOKENS was invalid JSON; using devnet USDC only")
        return {DEVNET_USDC_MINT}

def get_supported_token_metadata() -> dict[str, dict[str, Any]]:
    raw = os.environ.get("SOLANA_ALLOWED_SPL_TOKENS", "").strip()
    default = {
        DEVNET_USDC_MINT: {
            "symbol": "USDC",
            "name": "USD Coin",
            "decimals": 6,
            "unit_price_usd": 1.0,
        }
    }
    if not raw:
        return default
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return default
    if not isinstance(parsed, list):
        return default
    metadata = {}
    for token in parsed:
        if not isinstance(token, dict):
            continue
        mint = str(token.get("mintAddress", "")).strip()
        if not mint:
            continue
        unit_price_usd = parse_optional_float(
            token.get("unitPriceUsd")
            or token.get("unit_price_usd")
            or token.get("priceUsd")
            or token.get("usdPrice")
        )
        symbol = str(token.get("symbol") or "").upper()
        metadata[mint] = {
            "symbol": token.get("symbol") or mint[:6].upper(),
            "name": token.get("name") or token.get("symbol") or "Token",
            "decimals": int(token.get("decimals") or 0),
            "unit_price_usd": unit_price_usd if unit_price_usd is not None else (1.0 if symbol in {"USDC", "USDT"} else None),
        }
    return metadata or default

def parse_optional_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None

def ui_amount_to_base_units(value: Any, decimals: int, *, allow_zero: bool = False) -> int:
    try:
        amount = Decimal(str(value))
        scaled = amount * (Decimal(10) ** decimals)
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise HTTPException(422, "Intent amount is invalid") from exc
    if amount < 0 or (amount == 0 and not allow_zero):
        raise HTTPException(422, "Intent amount must be positive")
    if scaled != scaled.to_integral_value():
        raise HTTPException(
            422,
            f"Intent amount has invalid token precision (received={format(amount, 'f')}, token_decimals={decimals})",
        )
    result = int(scaled)
    if result > 0xFFFF_FFFF_FFFF_FFFF:
        raise HTTPException(422, "Intent amount is outside the u64 range")
    return result

def encode_base58(data: bytes) -> str:
    value = int.from_bytes(data, "big")
    encoded = ""
    while value:
        value, remainder = divmod(value, 58)
        encoded = BASE58_ALPHABET[remainder] + encoded
    leading_zeroes = len(data) - len(data.lstrip(b"\0"))
    return (BASE58_ALPHABET[0] * leading_zeroes) + (encoded or BASE58_ALPHABET[0])

def decode_base58(value: str) -> bytes:
    number = 0
    for character in value:
        try:
            digit = BASE58_ALPHABET.index(character)
        except ValueError as exc:
            raise ValueError("Invalid base58 value") from exc
        number = number * 58 + digit
    decoded = number.to_bytes((number.bit_length() + 7) // 8, "big") if number else b""
    leading_zeroes = len(value) - len(value.lstrip(BASE58_ALPHABET[0]))
    return (b"\0" * leading_zeroes) + decoded

def decode_secret_key(value: str, expected_lengths: set[int], label: str) -> bytes:
    normalized = value.strip()
    if not normalized:
        raise RuntimeError(f"{label} is required")
    try:
        if normalized.startswith("["):
            decoded = bytes(json.loads(normalized))
        elif all(character in "0123456789abcdefABCDEF" for character in normalized) and len(normalized) % 2 == 0:
            decoded = bytes.fromhex(normalized)
        else:
            decoded = base64.b64decode(normalized, validate=True)
    except (ValueError, TypeError, json.JSONDecodeError, binascii.Error) as exc:
        raise RuntimeError(f"{label} is invalid") from exc
    if len(decoded) not in expected_lengths:
        expected = " or ".join(str(length) for length in sorted(expected_lengths))
        raise RuntimeError(f"{label} must contain {expected} bytes")
    return decoded

def get_program_pubkey() -> Pubkey:
    return Pubkey.from_string(TSN_PROGRAM_ID)

def find_tsn_pda(*seeds: bytes) -> Pubkey:
    return Pubkey.find_program_address(list(seeds), get_program_pubkey())[0]

def get_mother_escrow_pda() -> Pubkey:
    return find_tsn_pda(b"tsn_mother_escrow")

def get_epoch_treasury_pda(epoch_id: int, token_mint: Pubkey) -> Pubkey:
    return find_tsn_pda(b"tsn_epoch_treasury", bytes(get_mother_escrow_pda()), struct.pack("<Q", epoch_id), bytes(token_mint))

def get_epoch_ledger_pda(epoch_treasury: Pubkey) -> Pubkey:
    return find_tsn_pda(b"tsn_epoch_ledger", bytes(epoch_treasury))

def get_epoch_claim_slot_pda(epoch_treasury: Pubkey, slot: bytes) -> Pubkey:
    return find_tsn_pda(b"tsn_epoch_claim_slot", bytes(epoch_treasury), slot)

def get_settlement_dna_pda(slot: bytes) -> Pubkey:
    """Derive the Mother-rooted, one-time settlement DNA account.

    The Node only distributes this opaque address; the Mother authority must
    materialize it with ``tsn_create_settlement_dna`` before settlement.
    """
    return find_tsn_pda(
        b"tsn_settlement_dna",
        bytes(get_mother_escrow_pda()),
        slot,
    )

def derive_claim_slot(payment_id_hash: bytes, amount: int, token_mint: Pubkey, epoch_id: int, commitment_digest: bytes) -> bytes:
    if not TSN_NODE_CLAIM_SLOT_HMAC_SECRET:
        raise RuntimeError("TSN_NODE_CLAIM_SLOT_HMAC_SECRET is required")
    return hmac.new(TSN_NODE_CLAIM_SLOT_HMAC_SECRET.encode("utf-8"), b"TSN_EPOCH_CLAIM_SLOT_V1" + payment_id_hash + struct.pack("<Q", amount) + bytes(token_mint) + struct.pack("<Q", epoch_id) + commitment_digest, hashlib.sha256).digest()

def get_cranker_pda(operator: Pubkey) -> Pubkey:
    return find_tsn_pda(b"tsn_cranker", bytes(get_mother_escrow_pda()), bytes(operator))

def get_cranker_vault_pda(operator: Pubkey, token_mint: Pubkey) -> Pubkey:
    return find_tsn_pda(
        b"tsn_cranker_vault",
        bytes(get_cranker_pda(operator)),
        bytes(token_mint),
    )

def get_cranker_vault_token_pda(cranker_vault: Pubkey) -> Pubkey:
    return find_tsn_pda(b"tsn_cranker_vault_token", bytes(cranker_vault))

def get_associated_token_address(owner: Pubkey, token_mint: Pubkey) -> Pubkey:
    return Pubkey.find_program_address(
        [bytes(owner), bytes(TOKEN_PROGRAM_ID), bytes(token_mint)],
        ASSOCIATED_TOKEN_PROGRAM_ID,
    )[0]

def get_settlement_authorization_signing_key() -> SigningKey:
    secret = decode_secret_key(
        TSN_SETTLEMENT_AUTHORIZATION_SIGNING_KEY,
        {32, 64},
        "TSN_SETTLEMENT_AUTHORIZATION_SIGNING_KEY",
    )
    return SigningKey(secret[:32])


def _stable_verification_json(value: Any) -> str:
    """Match Receiver stable JSON for signing Node verification evidence."""
    if isinstance(value, dict):
        return "{" + ",".join(
            json.dumps(str(key), ensure_ascii=False) + ":" + _stable_verification_json(child)
            for key, child in sorted(value.items(), key=lambda item: str(item[0]))
        ) + "}"
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(_stable_verification_json(child) for child in value) + "]"
    if isinstance(value, float):
        if not math.isfinite(value):
            return "null"
        if value == 0:
            return "0"
        rendered = repr(value).lower()
        magnitude = abs(value)
        if 1e-6 <= magnitude < 1e21:
            decimal = format(Decimal(rendered), "f")
            return decimal.rstrip("0").rstrip(".") if "." in decimal else decimal
        if "e" in rendered:
            mantissa, exponent = rendered.split("e", 1)
            exponent_value = int(exponent)
            sign = "+" if exponent_value >= 0 else "-"
            return f"{mantissa}e{sign}{abs(exponent_value)}"
        return rendered
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _node_verification_signing_key() -> SigningKey:
    secret = decode_secret_key(
        TSN_NODE_VERIFICATION_SIGNING_KEY,
        {32, 64},
        "TSN_NODE_VERIFICATION_SIGNING_KEY",
    )
    return SigningKey(secret[:32])


def _node_verification_message(attestation: dict[str, Any]) -> bytes:
    fields = (
        "version", "workId", "workKind", "decision", "inputPayloadCommitment",
        "evidenceCommitment", "executionPayloadCommitment", "verificationType", "leaseId", "leaseVersion",
        "nodeId", "keyId", "signedAt",
    )
    values = [str(attestation.get(field) or "") for field in fields]
    if any("\n" in value or "\r" in value for value in values):
        raise ValueError("Node verification attestation contains an invalid field")
    return ("TSN_NODE_VERIFICATION_V1\n" + "\n".join(values)).encode("utf-8")


def _sign_node_verification(
    *, work: dict[str, Any], status: str, evidence: dict[str, Any], verification_type: str,
) -> dict[str, Any]:
    key = _node_verification_signing_key()
    public_key = bytes(key.verify_key)
    lease = work.get("nodeLease") or {}
    verified_payload = evidence.get("verifiedPayload")
    if status == "VERIFIED" and isinstance(verified_payload, dict):
        allowed = {
            # Keep this projection in sync with Receiver's crankerExecutionPayload:
            # funding execution only needs the immutable owner-signed deposit
            # and its declared funding mode. The other verified payment fields
            # are evidence, not Cranker execution inputs.
            "AUTHORIZED_FUNDING": {"senderSignedFundingTransaction", "senderFundingMode"},
            "SETTLEMENT": {"tcapCreditTransition"},
            "TIN_OPERATION": {
                "intentId", "intentType", "ownerPubkey", "ownerSignature", "ownerIntentHash",
                "ownerIntentMessage", "ownerSignatureMessageFormat", "expiry", "nonce",
                "lookupCommitment", "encryptedIdentityEnvelope", "encryptedTinRecovery", "encryptedMasterSeed", "encryptedMetadataHash",
                "routeVersion", "routeNonce",
                "tcapRouteVersion", "tcapRelationshipCommitment", "tcapRelationshipReference", "tcapPolicyCommitment",
            },
        }.get(str(work.get("kind") or ""), set())
        execution_payload = {name: verified_payload[name] for name in allowed if name in verified_payload}
    else:
        execution_payload = {}
    attestation: dict[str, Any] = {
        "version": 1,
        "algorithm": "Ed25519",
        "workId": str(work.get("id") or ""),
        "workKind": str(work.get("kind") or ""),
        "decision": status,
        "inputPayloadCommitment": str(work.get("payloadCommitment") or "").lower(),
        "evidenceCommitment": hashlib.sha256(_stable_verification_json(evidence).encode("utf-8")).hexdigest(),
        "executionPayloadCommitment": hashlib.sha256(_stable_verification_json(execution_payload).encode("utf-8")).hexdigest(),
        "verificationType": verification_type,
        "leaseId": str(lease.get("leaseId") or ""),
        "leaseVersion": int(lease.get("version") or work.get("stateVersion") or 0),
        "nodeId": TSN_NODE_ID,
        "keyId": hashlib.sha256(public_key).hexdigest()[:24],
        "signedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    attestation["signatureBase64"] = base64.b64encode(key.sign(_node_verification_message(attestation)).signature).decode("ascii")
    attestation["signerPublicKeyBase64"] = base64.b64encode(public_key).decode("ascii")
    return attestation

def settlement_authorization_signer_pubkey() -> str:
    return encode_base58(bytes(get_settlement_authorization_signing_key().verify_key))

def require_worker_api_key(
    x_api_key: Optional[str] = Header(None, alias="x-api-key"),
) -> None:
    expected = TSN_RECEIVER_NODE_API_KEY or MEMPOOL_API_KEY
    if not expected or not secrets.compare_digest(x_api_key or "", expected):
        raise HTTPException(401, "Invalid TSN Node service credential")

def lease_authorization_message(
    action: Literal["payout", "recovery", "funding", "settlement"],
    work_id: str,
    operator_pubkey: str,
    requested_at_ts: int,
) -> bytes:
    return "|".join(
        [
            MEMPOOL_LEASE_DOMAIN,
            action,
            work_id,
            operator_pubkey,
            str(requested_at_ts),
        ]
    ).encode()

def lease_id_hash(work_id: str) -> bytes:
    return hashlib.sha256(work_id.encode("utf-8")).digest()

def verify_lease_authorization(
    action: Literal["payout", "recovery", "funding", "settlement"],
    work_id: str,
    operator_pubkey: str,
    requested_at_ts: int,
    signature_base64: str,
) -> Pubkey:
    now = int(time.time())
    if abs(now - requested_at_ts) > LEASE_AUTH_MAX_AGE_SECS:
        raise HTTPException(401, "Cranker lease authorization expired")
    try:
        operator = Pubkey.from_string(operator_pubkey)
        signature = base64.b64decode(signature_base64, validate=True)
        VerifyKey(bytes(operator)).verify(
            lease_authorization_message(
                action,
                work_id,
                operator_pubkey,
                requested_at_ts,
            ),
            signature,
        )
    except (ValueError, BadSignatureError, binascii.Error) as exc:
        raise HTTPException(401, "Invalid Cranker lease authorization") from exc
    return operator

def decrypt_settlement_token(encrypted: dict[str, Any]) -> dict[str, Any]:
    try:
        secret = decode_secret_key(
            TSN_SETTLEMENT_AUTHORIZATION_SIGNING_KEY,
            {32},
            "TSN_SETTLEMENT_AUTHORIZATION_SIGNING_KEY",
        )
        nonce = base64.b64decode(str(encrypted["nonceBase64"]), validate=True)
        ephemeral = base64.b64decode(
            str(encrypted["ephemeralPublicKeyBase64"]),
            validate=True,
        )
        ciphertext = base64.b64decode(
            str(encrypted["ciphertextBase64"]),
            validate=True,
        )
        plaintext = Box(
            PrivateKey(secret),
            Curve25519PublicKey(ephemeral),
        ).decrypt(ciphertext, nonce)
        payload = json.loads(plaintext.decode())
    except (
        KeyError,
        ValueError,
        TypeError,
        CryptoError,
        json.JSONDecodeError,
        binascii.Error,
    ) as exc:
        raise HTTPException(422, "Encrypted settlement route is invalid") from exc

    try:
        transfer_id = bytes.fromhex(str(payload.get("transferId") or ""))
        decryption_secret = base64.b64decode(
            str(payload.get("decryptionSecret") or ""),
            validate=True,
        )
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(422, "Settlement route secret is invalid") from exc
    if len(transfer_id) != 32 or len(decryption_secret) != 32:
        raise HTTPException(422, "Settlement route secret is invalid")
    try:
        recipient = bytes(Pubkey.from_string(str(payload["recipientWallet"])))
        mint = bytes(Pubkey.from_string(str(payload["tokenMintAddress"])))
        recipient_amount = int(payload["recipientAmountBaseUnits"])
        claim_fee_amount = int(payload.get("claimFeeAmountBaseUnits") or 0)
        epoch = int(payload["epoch"])
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(422, "Settlement route fields are invalid") from exc
    for label, value in (
        ("recipient amount", recipient_amount),
        ("claim fee amount", claim_fee_amount),
        ("epoch", epoch),
    ):
        if value < 0 or value > 0xFFFF_FFFF_FFFF_FFFF:
            raise HTTPException(422, f"Settlement route {label} is outside the u64 range")
    if recipient_amount == 0:
        raise HTTPException(422, "Settlement route recipient amount must be greater than zero")
    commitment = hashlib.sha256(
        b"TSN_SETTLEMENT_V1"
        + transfer_id
        + recipient
        + mint
        + recipient_amount.to_bytes(8, "little")
        + claim_fee_amount.to_bytes(8, "little")
        + epoch.to_bytes(8, "little")
        + decryption_secret
    ).hexdigest()
    if not secrets.compare_digest(commitment, str(encrypted.get("commitmentHash") or "")):
        raise HTTPException(422, "Settlement route commitment mismatch")
    if payload.get("transferId") != encrypted.get("transferId") or epoch != encrypted.get("epoch"):
        raise HTTPException(422, "Settlement route metadata mismatch")
    try:
        expires_at = datetime.fromisoformat(
            str(payload["expiresAt"]).replace("Z", "+00:00")
        )
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(422, "Settlement authorization expiry is invalid") from exc
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        raise HTTPException(409, "Settlement authorization has expired")
    return payload

def private_payout_permit_message(
    operator: Pubkey,
    epoch_treasury: Pubkey,
    epoch_ledger: Pubkey,
    claim_slot: Pubkey,
    slot: bytes,
    payout_nullifier: bytes,
    commitment_digest: bytes,
    random_nonce: bytes,
    settlement_commitment: bytes,
    cranker_vault: Pubkey,
    recipient_wallet: Pubkey,
    token_mint: Pubkey,
    payout_amount: int,
    claim_fee_amount: int,
    lease_id_hash_value: bytes,
    lease_version: int,
    lease_expiry_ts: int,
    expires_at_ts: int,
) -> bytes:
    return b"".join(
        [
            PRIVATE_PAYOUT_DOMAIN,
            bytes(get_program_pubkey()),
            bytes(get_mother_escrow_pda()),
            bytes(operator),
            bytes(epoch_treasury), bytes(epoch_ledger), bytes(claim_slot), slot,
            settlement_commitment,
            commitment_digest,
            random_nonce,
            payout_nullifier,
            bytes(cranker_vault),
            bytes(recipient_wallet),
            bytes(token_mint),
            struct.pack("<Q", payout_amount),
            struct.pack("<Q", claim_fee_amount),
            lease_id_hash_value,
            struct.pack("<Q", lease_version),
            struct.pack("<q", lease_expiry_ts),
            struct.pack("<q", expires_at_ts),
        ]
    )

# â”€â”€ Store helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
class FirebaseStore:
    """Firestore-backed store with the hash-like methods used by this API."""

    def __init__(self):
        try:
            import firebase_admin
            from firebase_admin import credentials, firestore
        except ImportError as exc:
            raise RuntimeError(
                "firebase-admin is required for TSN mempool storage. "
                "Run: pip install -r requirements.txt"
            ) from exc

        if not firebase_admin._apps:
            project_id = os.environ.get("FIREBASE_PROJECT_ID")
            client_email = os.environ.get("FIREBASE_CLIENT_EMAIL")
            private_key = os.environ.get("FIREBASE_PRIVATE_KEY", "").replace("\\n", "\n")
            credentials_path = (
                os.environ.get("FIREBASE_CREDENTIALS")
                or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
            )
            if not credentials_path:
                credential_files = glob.glob(os.path.join(".fb_creds", "*.json"))
                credentials_path = credential_files[0] if credential_files else None

            if credentials_path:
                firebase_admin.initialize_app(credentials.Certificate(credentials_path))
            elif project_id and client_email and private_key:
                firebase_admin.initialize_app(
                    credentials.Certificate({
                        "type": "service_account",
                        "project_id": project_id,
                        "client_email": client_email,
                        "private_key": private_key,
                        "token_uri": "https://oauth2.googleapis.com/token",
                    })
                )
            else:
                raise RuntimeError(
                    "Firebase mempool storage requires FIREBASE_PROJECT_ID, "
                    "FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env, "
                    "or a Firebase service-account JSON file in .fb_creds"
                )

        self.firestore = firestore
        self.db = firestore.client()
        self.root = self.db.collection(FIREBASE_COLLECTION)

    def _doc(self, key: str):
        return self.root.document(key.replace("/", "__"))

    def _item_doc(self, key: str, field: str):
        return self._doc(key).collection("items").document(field.replace("/", "__"))

    async def get(self, key: str) -> Optional[str]:
        doc = await asyncio.to_thread(lambda: self._doc(key).get())
        if not doc.exists:
            return None
        return (doc.to_dict() or {}).get("value")

    async def set(self, key: str, value: str) -> None:
        await asyncio.to_thread(lambda: self._doc(key).set({"value": value}))

    async def hget(self, key: str, field: str) -> Optional[str]:
        doc = await asyncio.to_thread(lambda: self._item_doc(key, field).get())
        if not doc.exists:
            return None
        return (doc.to_dict() or {}).get("value")

    async def hgetall(self, key: str) -> dict:
        def read_items() -> dict:
            return {
                doc.id: (doc.to_dict() or {}).get("value")
                for doc in self._doc(key).collection("items").stream()
            }
        return await asyncio.to_thread(read_items)

    async def hlen(self, key: str) -> int:
        return len(await self.hgetall(key))

    async def hset(self, key: str, field: Optional[str] = None, value: Optional[str] = None, mapping: Optional[dict] = None) -> None:
        if mapping:
            def write_mapping() -> None:
                batch = self.db.batch()
                for item_field, item_value in mapping.items():
                    batch.set(self._item_doc(key, item_field), {"value": item_value})
                batch.commit()
            await asyncio.to_thread(write_mapping)
            return

        if field is None or value is None:
            raise ValueError("hset requires either field/value or mapping")
        await asyncio.to_thread(lambda: self._item_doc(key, field).set({"value": value}))

    async def consume_once(self, key: str, field: str, value: str) -> bool:
        def consume() -> bool:
            transaction = self.db.transaction()

            @self.firestore.transactional
            def update(transaction):
                reference = self._item_doc(key, field)
                snapshot = reference.get(transaction=transaction)
                if snapshot.exists:
                    return False
                transaction.set(reference, {"value": value})
                return True

            return bool(update(transaction))

        return await asyncio.to_thread(consume)

    async def delete(self, *keys: str) -> None:
        def delete_keys() -> None:
            for key in keys:
                bucket = self._doc(key)
                for doc in bucket.collection("items").stream():
                    doc.reference.delete()
                bucket.delete()
        await asyncio.to_thread(delete_keys)

    async def aclose(self) -> None:
        return None

class FileStore:
    """Local JSON-backed mempool store for devnet testing without Firebase quota."""

    def __init__(self, path: Path = MEMPOOL_FILE):
        self.path = path
        self._lock = asyncio.Lock()

    async def _read(self) -> dict:
        if not self.path.exists():
            return {"values": {}, "hashes": {}}
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            logger.warning("Local mempool file was invalid JSON; starting fresh: %s", self.path)
            return {"values": {}, "hashes": {}}

    async def _write(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    async def get(self, key: str) -> Optional[str]:
        async with self._lock:
            data = await self._read()
            return data.get("values", {}).get(key)

    async def set(self, key: str, value: str) -> None:
        async with self._lock:
            data = await self._read()
            data.setdefault("values", {})[key] = value
            await self._write(data)

    async def hget(self, key: str, field: str) -> Optional[str]:
        async with self._lock:
            data = await self._read()
            return data.get("hashes", {}).get(key, {}).get(field)

    async def hgetall(self, key: str) -> dict:
        async with self._lock:
            data = await self._read()
            return dict(data.get("hashes", {}).get(key, {}))

    async def hlen(self, key: str) -> int:
        return len(await self.hgetall(key))

    async def hset(self, key: str, field: Optional[str] = None, value: Optional[str] = None, mapping: Optional[dict] = None) -> None:
        async with self._lock:
            data = await self._read()
            bucket = data.setdefault("hashes", {}).setdefault(key, {})
            if mapping:
                bucket.update(mapping)
            elif field is not None and value is not None:
                bucket[field] = value
            else:
                raise ValueError("hset requires either field/value or mapping")
            await self._write(data)

    async def consume_once(self, key: str, field: str, value: str) -> bool:
        async with self._lock:
            data = await self._read()
            bucket = data.setdefault("hashes", {}).setdefault(key, {})
            if field in bucket:
                return False
            bucket[field] = value
            await self._write(data)
            return True

    async def delete(self, *keys: str) -> None:
        async with self._lock:
            data = await self._read()
            for key in keys:
                data.get("values", {}).pop(key, None)
                data.get("hashes", {}).pop(key, None)
            await self._write(data)

    async def aclose(self) -> None:
        return None

_store: Optional[Any] = None

async def get_store() -> Any:
    global _store
    if _store is None:
        if TSN_RECEIVER_URL:
            _store = ReceiverStore(TSN_RECEIVER_URL, TSN_RECEIVER_NODE_API_KEY, TSN_RECEIVER_FALLBACK_URL)
            logger.info("TSN Node durable state is delegated to Receiver: %s", TSN_RECEIVER_URL)
        elif MEMPOOL_STORE == "firebase" and ALLOW_DIRECT_FIREBASE_STORE:
            _store = FirebaseStore()
        elif MEMPOOL_STORE in {"file", "local", "json"} and ALLOW_LOCAL_JSON_STORE:
            _store = FileStore()
            logger.warning("Using explicitly enabled local-only TSN JSON store: %s", MEMPOOL_FILE)
        else:
            raise RuntimeError(
                "TSN Node durable state requires TSN_RECEIVER_URL and TSN_RECEIVER_NODE_API_KEY. "
                "Direct Firebase and local JSON are isolated-test adapters only."
            )
    return _store

async def get_mempool_store() -> Any:
    return await get_store()

def k_intents() -> str: return f"{MEMPOOL_NS}:intents"
def k_epoch()   -> str: return f"{MEMPOOL_NS}:epoch"
def k_crankers() -> str: return f"{MEMPOOL_NS}:crankers"
def k_tin_operation_nonces() -> str: return f"{MEMPOOL_NS}:tin_operation_nonces"
def k_canonical_message_nonces() -> str: return f"{MEMPOOL_NS}:canonical_message_nonces"
def k_threshold_access_nonces() -> str: return f"{MEMPOOL_NS}:threshold_access_nonces"
def k_recipient_route_binding(work_id: str) -> str: return f"{MEMPOOL_NS}:recipient_route_binding:{work_id}"


async def hget_all_json(key: str) -> list:
    r = await get_mempool_store()
    raw: dict = await r.hgetall(key)
    return [json.loads(v) for v in raw.values()]


async def write_recipient_route_binding(
    *, work_id: str, tin: str, commitment: str, route_version: int, expires_at: str,
) -> None:
    """Persist the recipient reference separately from the sender's intent.

    The payment work document contains only the signed route commitment.  The
    Node retains this short-lived reference so it can resolve the recipient
    route later when a funded settlement needs authorization.
    """
    await (await get_mempool_store()).set(
        k_recipient_route_binding(work_id),
        json.dumps({
            "tin": tin,
            "commitment": commitment.lower(),
            "routeVersion": route_version,
            "expiresAt": expires_at,
        }),
    )

def private_settlement_commitment(
    epoch_treasury: Pubkey, epoch_ledger: Pubkey, slot: bytes, commitment_digest: bytes,
    random_nonce: bytes, cranker_vault: Pubkey, recipient_wallet: Pubkey,
    token_mint: Pubkey, payout_amount: int, payout_nullifier: bytes,
    lease_id_hash_value: bytes, lease_version: int, lease_expiry_ts: int,
    expires_at_ts: int,
) -> bytes:
    return hashlib.sha256(b"TSN_SETTLEMENT_COMMITMENT_V2" + bytes(epoch_treasury)
        + bytes(epoch_ledger) + slot + commitment_digest + random_nonce + payout_nullifier + bytes(cranker_vault)
        + bytes(recipient_wallet) + bytes(token_mint) + struct.pack("<Q", payout_amount)
        + struct.pack("<Q", 0) + lease_id_hash_value + struct.pack("<Q", lease_version)
        + struct.pack("<q", lease_expiry_ts) + struct.pack("<q", expires_at_ts)).digest()


async def read_recipient_route_binding(work_id: str) -> Optional[dict[str, Any]]:
    store = await get_mempool_store()
    key = k_recipient_route_binding(work_id)
    raw = await store.get(key)
    if not raw:
        return None
    try:
        binding = json.loads(raw)
        expires_at = parse_iso(str(binding["expiresAt"]))
        if expires_at <= datetime.now(timezone.utc):
            await store.delete(key)
            return None
        if (
            not re.fullmatch(r"\d+", str(binding.get("tin") or ""))
            or not re.fullmatch(r"[a-f0-9]{64}", str(binding.get("commitment") or "").lower())
            or int(binding.get("routeVersion") or 0) < 1
        ):
            raise ValueError("invalid recipient route binding")
        return binding
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        await store.delete(key)
        return None


async def read_epoch_state() -> dict:
    r = await get_mempool_store()
    raw = await r.get(k_epoch())
    if raw:
        return json.loads(raw)
    now_iso = datetime.now(timezone.utc).isoformat()
    state = {"epoch_number": 1, "started_at": now_iso}
    await r.set(k_epoch(), json.dumps(state))
    return state


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def next_close_for_state(state: dict) -> datetime:
    started_dt = parse_iso(state["started_at"])
    return datetime.fromtimestamp(started_dt.timestamp() + EPOCH_SECS, tz=timezone.utc)


def is_epoch_due(state: dict) -> bool:
    return datetime.now(timezone.utc) >= next_close_for_state(state)



async def build_epoch_status() -> EpochStatus:
    r = await get_mempool_store()
    state        = await read_epoch_state()
    intent_count = await r.hlen(k_intents())
    settlement_count = sum(1 for intent in await hget_all_json(k_intents()) if intent.get("status") in {"executed", "settled"})
    next_close   = next_close_for_state(state)
    return EpochStatus(
        epoch_number    = state["epoch_number"],
        epoch_started_at= state["started_at"],
        next_close_at   = next_close.isoformat(),
        intent_count    = int(intent_count),
        settlement_count = settlement_count,
    )

async def get_token_account_balance_ui(token_account: str) -> tuple[float, int]:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTokenAccountBalance",
        "params": [token_account],
    }
    async with httpx.AsyncClient(timeout=12) as client:
        response = await client.post(TSN_SOLANA_RPC_URL, json=payload)
    response.raise_for_status()
    value = response.json().get("result", {}).get("value", {})
    return float(value.get("uiAmountString") or value.get("uiAmount") or 0), int(value.get("decimals") or 0)

async def solana_rpc(method: str, params: list[Any], timeout: float = 12) -> dict[str, Any]:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    }
    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=timeout) as client:
        for rpc_url in TSN_SOLANA_RPC_URLS:
            try:
                response = await client.post(rpc_url, json=payload)
                response.raise_for_status()
                rpc_response = response.json()
                if rpc_response.get("error"):
                    last_error = RuntimeError(str(rpc_response["error"]))
                    continue
                return rpc_response
            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc
                logger.warning("Solana RPC unavailable for %s at %s: %s", method, rpc_url, exc)
    raise HTTPException(503, "Solana RPC is unavailable while verifying TINS state") from last_error

def get_tins_program_pubkey() -> Pubkey:
    return Pubkey.from_string(TINS_PROGRAM_ID)

def get_private_tin_pda(tin: str) -> Pubkey:
    if len(TINS_LOOKUP_SECRET.encode("utf-8")) < 16:
        raise ValueError("TINS_LOOKUP_SECRET must contain at least 16 bytes")
    lookup_commitment = hashlib.sha256(
        b"TSN_TIN_V1_LOOKUP" + TINS_LOOKUP_SECRET.encode("utf-8") + str(tin).encode("utf-8")
    ).digest()
    return Pubkey.find_program_address([b"tin-v1", lookup_commitment], get_tins_program_pubkey())[0]

def decode_private_tin_route_material(data: bytes) -> dict[str, Any]:
    buffer = bytes(data)
    offset = 0

    def take(length: int, label: str) -> bytes:
        nonlocal offset
        if length < 0 or offset + length > len(buffer):
            raise ValueError(f"private TIN account {label} is truncated")
        value = buffer[offset:offset + length]
        offset += length
        return value

    def take_u32(label: str) -> int:
        return int.from_bytes(take(4, label), "little")

    version = take(1, "version")[0]
    bump = take(1, "bump")[0]
    status = take(1, "status")[0]
    take(5, "reserved")
    lookup_commitment = take(32, "lookup commitment")
    owner_commitment = take(32, "owner commitment")
    identity_len = take_u32("identity envelope length")
    identity_envelope = take(identity_len, "identity envelope")
    seed_len = take_u32("seed envelope length")
    take(seed_len, "seed envelope")
    take(8, "created at")
    take(32, "metadata hash")
    route_version = int.from_bytes(take(8, "route version"), "little")
    route_nonce = take(32, "route nonce")
    tcap_route_version = take(1, "TCap route version")[0]
    tcap_relationship_commitment = take(32, "TCap relationship commitment")
    tcap_relationship_reference = take(32, "TCap relationship reference")
    tcap_policy_commitment = take(32, "TCap policy commitment")
    if version != 1 or status != 1 or any(buffer[offset:]):
        raise ValueError("unsupported private TIN account schema")
    if lookup_commitment == bytes(32) or route_version < 1:
        raise ValueError("private TIN account commitments are incomplete")
    return {
        "lookupCommitment": lookup_commitment.hex(),
        "ownerPubkeyHash": owner_commitment.hex(),
        "identityEnvelope": identity_envelope,
        "routeVersion": route_version,
        "routeNonce": route_nonce.hex(),
        "tcapRouteVersion": tcap_route_version,
        "tcapRelationshipCommitment": tcap_relationship_commitment.hex(),
        "tcapRelationshipReference": tcap_relationship_reference.hex(),
        "tcapPolicyCommitment": tcap_policy_commitment.hex(),
    }


async def resolve_tin_display_identity(tin: str) -> Optional[dict[str, Any]]:
    """Resolve the owner-provided name and owner hash; keep route material in Node."""
    try:
        material = decode_private_tin_route_material(await read_tins_account_data(get_private_tin_pda(tin)) or b"")
        envelope = bytes(material["identityEnvelope"])
        if len(envelope) < 13:
            return None
        key = hashlib.sha256(b"TSN_TIN_V1_IDENTITY" + TINS_LOOKUP_SECRET.encode("utf-8") + str(tin).encode("utf-8")).digest()
        plaintext = AESGCM(key).decrypt(envelope[:12], envelope[12:], None)
        identity = json.loads(plaintext.decode("utf-8"))
        if str(identity.get("tin")) != str(tin) or not isinstance(identity.get("name"), str):
            return None
        return {
            "displayName": identity["name"],
            "ownerPubkeyHash": str(material["ownerPubkeyHash"]),
            # Credentials must come from Node-validated identity data, never from sender input.
            "verifiedCredentials": [],
        }
    except (HTTPException, InvalidTag, ValueError, TypeError, KeyError, binascii.Error, json.JSONDecodeError):
        return None





async def read_tins_account_data(pubkey: Pubkey) -> Optional[bytes]:
    rpc_response = await solana_rpc(
        "getAccountInfo",
        [
            str(pubkey),
            {"encoding": "base64", "commitment": "confirmed"},
        ],
    )
    value = rpc_response.get("result", {}).get("value")
    if not value:
        return None
    if str(value.get("owner") or "") != TINS_PROGRAM_ID:
        return None
    encoded = ((value.get("data") or [None])[0])
    if not encoded:
        return None
    try:
        return base64.b64decode(encoded)
    except (binascii.Error, TypeError):
        return None





async def read_onchain_tin_tcap_relationship(tin: str) -> Optional[dict[str, Any]]:
    """Resolve only the current private TIN V1 TCap commitments."""
    try:
        lookup_commitment = hashlib.sha256(
            b"TSN_TIN_V1_LOOKUP" + TINS_LOOKUP_SECRET.encode("utf-8") + str(tin).encode("utf-8")
        ).digest()
        identity = get_private_tin_pda(tin)
        data = await read_tins_account_data(identity)
        if not data:
            return None
        material = decode_private_tin_route_material(data)
        if not hmac.compare_digest(bytes.fromhex(material["lookupCommitment"]), lookup_commitment):
            return None
        if int(material.get("tcapRouteVersion") or 0) != 1:
            return None
        gpru_commitment = _resolve_tin_gpru_commitment(
            material["tcapRelationshipCommitment"], material["tcapRelationshipReference"]
        )
        if not gpru_commitment:
            return None
        return {
            "tin": str(tin),
            "ownerPubkeyHash": material["ownerPubkeyHash"],
            "tcapRouteVersion": 1,
            "tcapRelationshipCommitment": material["tcapRelationshipCommitment"],
            "tcapRelationshipReference": material["tcapRelationshipReference"],
            "gpruCommitment": gpru_commitment,
            "tcapPolicyCommitment": material["tcapPolicyCommitment"],
        }
    except (HTTPException, ValueError, TypeError, binascii.Error):
        return None


def _resolve_tin_gpru_commitment(relationship_commitment: str, relationship_reference: str) -> Optional[str]:
    """Return the public GPRU curve point only for the active field layout."""
    try:
        commitment = bytes.fromhex(relationship_commitment)
        reference = bytes.fromhex(relationship_reference)
    except (TypeError, ValueError):
        return None
    if len(commitment) != 32 or len(reference) != 32:
        return None
    current_tip_seed = hashlib.sha256(
        b"TSN_TCAP_TIN_TIP_ROOT_COMMITMENT_V1\0" + commitment
    ).digest()
    if hmac.compare_digest(current_tip_seed, reference):
        return commitment.hex()
    return None



async def get_program_accounts(account_size: int) -> list[dict[str, Any]]:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getProgramAccounts",
        "params": [
            TSN_PROGRAM_ID,
            {
                "encoding": "base64",
                "filters": [{"dataSize": account_size}],
            },
        ],
    }
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(TSN_SOLANA_RPC_URL, json=payload)
    response.raise_for_status()
    return response.json().get("result") or []

async def read_onchain_cranker_vaults() -> list[dict[str, Any]]:
    """Discover CrankerVault accounts from the TSN program and read their public fields."""
    accounts = await get_program_accounts(CRANKER_VAULT_ACCOUNT_SIZE)
    results: list[dict[str, Any]] = []
    supported_metadata = get_supported_token_metadata()
    supported_mints = set(supported_metadata.keys())
    for account in accounts:
        encoded = (((account.get("account") or {}).get("data") or [None])[0])
        if not encoded:
            continue
        try:
            data = base64.b64decode(encoded)
        except Exception:
            continue
        if len(data) != CRANKER_VAULT_ACCOUNT_SIZE or data[:8] != CRANKER_VAULT_DISCRIMINATOR:
            continue
        mother_escrow = encode_base58(data[8:40])
        cranker = encode_base58(data[40:72])
        mint = encode_base58(data[72:104])
        token_account = encode_base58(data[104:136])
        if supported_mints and mint not in supported_mints:
            continue
        total_liquidity_base_units = int.from_bytes(data[137:145], "little")
        total_shares = int.from_bytes(data[145:153], "little")
        reserved_liquidity_base_units = int.from_bytes(data[153:161], "little")
        total_withdrawn_base_units = int.from_bytes(data[161:169], "little")
        total_rewards_base_units = int.from_bytes(data[169:177], "little")
        metadata = supported_metadata.get(mint, {})
        results.append({
            "cranker_vault": account.get("pubkey"),
            "mother_escrow": mother_escrow,
            "cranker": cranker,
            "token_mint": mint,
            "token_symbol": metadata.get("symbol") or mint[:6].upper(),
            "token_name": metadata.get("name") or metadata.get("symbol") or "Token",
            "unit_price_usd": metadata.get("unit_price_usd"),
            "vault_token_account": token_account,
            "program_total_liquidity_base_units": total_liquidity_base_units,
            "program_total_shares": total_shares,
            "program_reserved_liquidity_base_units": reserved_liquidity_base_units,
            "program_withdrawable_liquidity_base_units": max(
                0, total_liquidity_base_units - reserved_liquidity_base_units
            ),
            "program_total_withdrawn_base_units": total_withdrawn_base_units,
            "program_total_rewards_base_units": total_rewards_base_units,
        })
    return results

async def read_public_vault_liquidity() -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for vault in await read_onchain_cranker_vaults():
        balance_ui = 0.0
        decimals = 0
        try:
            balance_ui, decimals = await get_token_account_balance_ui(vault["vault_token_account"])
        except Exception:
            logger.exception("Could not read on-chain vault token balance for %s", vault["vault_token_account"])

        results.append({
            **vault,
            "total_liquidity": balance_ui,
            "total_liquidity_usd": balance_ui * float(vault.get("unit_price_usd") or 0),
            "withdrawable_liquidity": max(
                0.0,
                balance_ui
                - float(vault.get("program_reserved_liquidity_base_units") or 0)
                / (10 ** decimals),
            ),
            "withdrawable_liquidity_usd": max(
                0.0,
                balance_ui
                - float(vault.get("program_reserved_liquidity_base_units") or 0)
                / (10 ** decimals),
            ) * float(vault.get("unit_price_usd") or 0),
            "decimals": decimals,
        })
    return results

async def read_public_vault_liquidity_cached() -> list[dict[str, Any]]:
    """Read vault liquidity from Solana RPC at most once per epoch by default."""
    global _vault_liquidity_cache

    state = await read_epoch_state()
    epoch_number = int(state["epoch_number"])
    now = time.monotonic()
    cached = _vault_liquidity_cache

    if (
        cached
        and cached.get("epoch_number") == epoch_number
        and now - float(cached.get("loaded_at", 0)) < VAULT_LIQUIDITY_REFRESH_SECS
    ):
        return list(cached.get("vaults") or [])

    async with _vault_liquidity_lock:
        now = time.monotonic()
        cached = _vault_liquidity_cache
        if (
            cached
            and cached.get("epoch_number") == epoch_number
            and now - float(cached.get("loaded_at", 0)) < VAULT_LIQUIDITY_REFRESH_SECS
        ):
            return list(cached.get("vaults") or [])

        vaults = await read_public_vault_liquidity()
        _vault_liquidity_cache = {
            "epoch_number": epoch_number,
            "loaded_at": now,
            "vaults": vaults,
        }
        logger.info(
            "vault.liquidity.refreshed epoch=%s vaults=%s next_refresh_secs=%s",
            epoch_number,
            len(vaults),
            VAULT_LIQUIDITY_REFRESH_SECS,
        )
        return list(vaults)

# â”€â”€ Models â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
class CreateIntentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    paymentId: str = Field(..., description="Unique payment ID")
    intentSeedHash: str = Field(..., description="SHA-256 hex of paymentId")
    recipientHash: str = Field(..., description="Hashed recipient")
    recipientTin: str = Field(..., description="Recipient TIN used for private settlement routing")
    tokenMintAddress: str = Field(..., description="SPL token mint address")
    amount: float = Field(..., description="Payment amount")
    senderWallet: str = Field(..., description="Wallet that signed the TSN payment authorization")
    senderAuthorizationMessage: str = Field(..., description="Canonical TSN payment authorization message")
    senderAuthorizationSignature: str = Field(..., description="Wallet signature over the authorization message")
    senderAuthorizationNonce: str = Field(..., description="Unique authorization nonce")
    senderAuthorizationIssuedAt: Optional[str] = Field(None, description="Authorization issue timestamp")
    senderAuthorizationExpiresAt: Optional[str] = Field(None, description="Authorization expiry timestamp")
    senderFeeAmount: Optional[float] = Field(None, description="Sender-side protocol fee routed to treasury")
    senderSignedFundingTransaction: str = Field(..., description="Owner-signed TCAP deposit_asset_v2 transaction")
    senderFundingMode: Literal["tcap_deposit_v2"] = Field(..., description="Required TCAP V2 funding authority model")
    recipientAmount: Optional[float] = Field(None, description="Amount paid to recipient")
    destinationNetwork: Optional[str] = Field(None, description="Signed destination settlement network for cross-chain exits")
    destinationExecutor: Optional[str] = Field(None, description="Signed destination executor contract for cross-chain exits")
    destinationToken: Optional[str] = Field(None, description="Signed destination-chain ERC-20 settlement token")
    settlementRouteId: Optional[str] = Field(None, description="Signed registered TSN settlement route")
    source: Optional[str] = Field(None)

class MempoolIntent(CreateIntentRequest):
    id:                   str
    status:               str           = "pending"
    assignedCrankerPubkey: Optional[str] = None
    fundingTxSig:         Optional[str] = None
    settlementTxSig:      Optional[str] = None
    settlementResolution: Optional[str] = None
    settlementReason:     Optional[str] = None
    postedAt:             str
    updatedAt:            str

class PublicMempoolIntent(BaseModel):
    id: str
    paymentId: str
    intentSeedHash: str
    recipientHash: str
    tokenMintAddress: str
    amount: float
    recipientAmount: Optional[float] = None
    source: Optional[str] = None
    status: str
    assignedCrankerPubkey: Optional[str] = None
    fundingTxSig: Optional[str] = None
    settlementTxSig: Optional[str] = None
    settlementResolution: Optional[str] = None
    settlementReason: Optional[str] = None
    postedAt: str
    updatedAt: str











class SignedLeasePermitRequest(BaseModel):
    operatorPubkey: str
    requestedAtTs: int
    requestSignatureBase64: str

class IntentWorkItem(BaseModel):
    intent: MempoolIntent

class UpdateStatusRequest(BaseModel):
    status:               str           = Field(...)
    assignedCrankerPubkey: Optional[str] = Field(None)
    fundingTxSig:         Optional[str] = Field(None)
    settlementTxSig:      Optional[str] = Field(None)
    settlementResolution: Optional[str] = Field(None)
    settlementReason:     Optional[str] = Field(None)

class CrankerHeartbeatRequest(BaseModel):
    operator_pubkey: str = Field(...)
    cranker_pubkey: Optional[str] = Field(None)
    version: Optional[str] = Field(None)
    source: Optional[str] = Field(None)

class CrankerHeartbeatRecord(CrankerHeartbeatRequest):
    first_seen_at: str
    last_seen_at: str
    online: bool = True

class EpochStatus(BaseModel):
    epoch_number:    int
    epoch_started_at: str
    next_close_at:   str
    intent_count:    int
    settlement_count: int

class EpochCloseResult(BaseModel):
    epoch_number:     int
    intents_archived: int
    settlements_archived: int
    intents_rolled_over: int = 0
    intents_pruned:      int = 0
    settlements_pruned: int = 0
    github_commit_url: str
    new_epoch_number:  int
    message:           str

class MempoolStatusRequest(BaseModel):
    action: Optional[str] = Field(default="status")

class MempoolStatusResponse(BaseModel):
    status: str = "ok"
    epoch:  EpochStatus

class IntentToSettlementMetrics(BaseModel):
    sample_count: int
    average_ms: float
    min_ms: float
    max_ms: float
    last_ms: float
    updated_at: Optional[str] = None

class UptimeMetrics(BaseModel):
    service_started_at: str
    uptime_seconds: int
    uptime_days: float
    downtime_events: int = 0

class MetricsResponse(BaseModel):
    intent_to_settlement: IntentToSettlementMetrics
    uptime: UptimeMetrics
    active_crankers_last_epoch: int

class TokenNetworkStatus(BaseModel):
    token_mint: str
    token_symbol: Optional[str] = None
    token_name: Optional[str] = None
    unit_price_usd: Optional[float] = None
    vault_token_account: Optional[str] = None
    cranker_vault: Optional[str] = None
    total_vault_liquidity_units: float = 0
    total_vault_liquidity_usd: float = 0
    total_vault_liquidity: float = 0
    total_intent_amount: float
    pending_intent_amount: float
    executed_intent_amount: float
    vault_liquidity_estimate: float
    liquidity_source: str = "program_scan"

class NetworkOverviewResponse(BaseModel):
    online_crankers_last_epoch: int
    total_crankers_seen: int
    total_vault_liquidity_usd: float
    total_vault_liquidity: float
    tokens: list[TokenNetworkStatus]

SERVICE_STARTED_AT = datetime.now(timezone.utc)

def public_intent(intent: MempoolIntent | dict[str, Any]) -> PublicMempoolIntent:
    data = intent.model_dump() if isinstance(intent, MempoolIntent) else intent
    return PublicMempoolIntent(**data)

def _field(data: dict[str, Any], *names: str, default: Any = None) -> Any:
    for name in names:
        if name in data and data[name] is not None:
            return data[name]
    return default

def _require_string(data: dict[str, Any], *names: str) -> str:
    value = _field(data, *names)
    if value is None or str(value).strip() == "":
        raise HTTPException(422, f"{names[0]} is required")
    return str(value).strip()

def _decode_hash32(value: Any, label: str) -> bytes:
    text = str(value or "").strip()
    if len(text) != 64:
        raise HTTPException(422, f"{label} must be a 32-byte hex value")
    try:
        decoded = bytes.fromhex(text)
    except ValueError as exc:
        raise HTTPException(422, f"{label} must be a 32-byte hex value") from exc
    if len(decoded) != 32:
        raise HTTPException(422, f"{label} must be a 32-byte hex value")
    return decoded


def _canonical_tin_owner_intent_message(intent_hash: bytes) -> bytes:
    """Return the printable owner-approval message used by browser wallets.

    The commitment remains the exact 32-byte ``ownerIntentHash``.  This
    display-safe wrapper exists because Phantom and some Wallet Standard
    adapters reject arbitrary binary message payloads even though they
    support detached message signing.
    """
    if len(intent_hash) != 32:
        raise ValueError("TIN owner intent hash must be exactly 32 bytes")
    return (
        "TrustLink TIN creation approval\n"
        "\n"
        "You are approving the encrypted creation request for your TIN.\n"
        "\n"
        "REQUEST DETAILS\n"
        f"Intent reference: {intent_hash.hex()}\n"
        "\n"
        "Protocol: Transfer Identity Network\n"
        "\n"
        "Version: 1\n"
        "\n"
        "NEXT STEP\n"
        "TSN will verify this approval before submission to Solana.\n"
        "\n"
        "No funds are transferred by this approval."
    ).encode("utf-8")

def _decode_base64_blob(value: Any, label: str) -> bytes:
    try:
        decoded = base64.b64decode(str(value or ""), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(422, f"{label} must be base64") from exc
    if not decoded:
        raise HTTPException(422, f"{label} must not be empty")
    return decoded

def _decode_owner_pubkey(value: str) -> bytes:
    try:
        owner_bytes = decode_base58(value)
    except ValueError as exc:
        raise HTTPException(422, "owner_pubkey is not valid base58") from exc
    if len(owner_bytes) != 32:
        raise HTTPException(422, "owner_pubkey must decode to 32 bytes")
    try:
        Pubkey.from_string(value)
    except ValueError as exc:
        raise HTTPException(422, "owner_pubkey is not a valid Solana pubkey") from exc
    return owner_bytes

def _expiry_from_input(value: Any) -> int:
    try:
        expiry = int(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, "expiry must be a unix timestamp in seconds") from exc
    if expiry <= int(time.time()):
        raise HTTPException(409, "TIN operation intent is expired")
    return expiry

def _sha256_hex_utf8(*parts: Any) -> str:
    return hashlib.sha256("|".join(str(part) for part in parts).encode("utf-8")).hexdigest()

def _encode_signed_i64_le(value: int) -> bytes:
    return int(value).to_bytes(8, "little", signed=True)

def _encode_u32_le(value: int) -> bytes:
    return int(value).to_bytes(4, "little", signed=False)

TSN_CANONICAL_DOMAIN_DISPLAY = "..." + hashlib.sha256(
    b"trustlink-pay:tsn:canonical-signing:v1"
).hexdigest()[-8:]

def _build_canonical_message(action: str, fields: list[tuple[str, str]]) -> str:
    return "\n".join(
        [f"TSN {action}", "---"]
        + [f"{label}: {value}" for label, value in fields]
        + [f"Domain: {TSN_CANONICAL_DOMAIN_DISPLAY}"]
    )

def _parse_canonical_message(message: str, expected_action: str) -> dict[str, str]:
    if not isinstance(message, str) or not message.startswith("TSN "):
        raise HTTPException(400, "signed message is not a canonical TSN message")
    lines = message.split("\n")
    if len(lines) < 4 or lines[0] != f"TSN {expected_action}" or lines[1] != "---":
        raise HTTPException(400, f"signed message must use the TSN {expected_action} template")
    parsed: dict[str, str] = {}
    for line in lines[2:]:
        if ": " not in line:
            raise HTTPException(400, f"canonical signed message field is malformed: {line}")
        label, value = line.split(": ", 1)
        if label in parsed:
            raise HTTPException(400, f"canonical signed message field is duplicated: {label}")
        parsed[label] = value
    if parsed.get("Domain") != TSN_CANONICAL_DOMAIN_DISPLAY:
        raise HTTPException(400, "canonical signed message domain does not match TSN")
    return parsed

def _parse_usdc_base_units(value: str, label: str) -> int:
    match = re.fullmatch(r"(\d+)(?:\.(\d{1,6}))? USDC", value)
    if not match:
        raise HTTPException(400, f"{label} must be a decimal USDC amount in the signed message")
    return int(match.group(1)) * 1_000_000 + int((match.group(2) or "").ljust(6, "0"))

def _parse_canonical_expiry(value: str) -> datetime:
    try:
        expires_at = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(400, "signed message expiry is not valid ISO 8601") from exc
    if expires_at <= datetime.now(timezone.utc):
        raise HTTPException(400, "signed message has expired")
    return expires_at

async def _assert_canonical_nonce_unused(
    *, action: str, authorization_domain: str, sender_public_key: str, nonce: str
) -> None:
    """Atomically consume a sender authorization nonce.

    The key is deliberately scoped to the signed authorization domain and
    sender.  ``consume_once`` performs the check and insert in one transaction
    in the Receiver state store, so concurrent Node workers cannot both accept
    the same signed authorization.
    """
    if not authorization_domain or not sender_public_key or not nonce:
        raise HTTPException(400, "signed message nonce identity is incomplete")
    key = hashlib.sha256(
        f"{authorization_domain}|{action}|{sender_public_key}|{nonce}".encode("utf-8")
    ).hexdigest()
    consumed = await (await get_mempool_store()).consume_once(
        k_canonical_message_nonces(),
        key,
        json.dumps(
            {
                "domain": authorization_domain,
                "action": action,
                "senderPublicKey": sender_public_key,
                "nonce": nonce,
                "usedAt": datetime.now(timezone.utc).isoformat(),
            },
            separators=(",", ":"),
        ),
    )
    if not consumed:
        raise HTTPException(400, "signed message nonce has already been used")

def _assert_recipient_hash_matches_owner(recipient_hash: str, owner_pubkey_hash: str) -> None:
    normalized_recipient_hash = str(recipient_hash or "").strip().lower()
    normalized_owner_hash = str(owner_pubkey_hash or "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", normalized_owner_hash):
        raise HTTPException(422, "Recipient TIN route has an invalid owner hash")
    if not re.fullmatch(r"[0-9a-f]{64}", normalized_recipient_hash):
        raise HTTPException(400, "recipientHash must be a 32-byte hexadecimal owner hash")
    if not hmac.compare_digest(normalized_recipient_hash, normalized_owner_hash):
        raise HTTPException(400, "recipientHash does not match the Node-resolved TIN owner hash")


async def _verify_payment_authorization_from_signed_message(req: CreateIntentRequest) -> dict[str, Any]:
    mode = req.senderFundingMode or ""
    if mode != "tcap_deposit_v2":
        raise HTTPException(400, "Legacy funding modes are retired; TSN requires a TCAP V2 wallet deposit")
    is_cross_chain = (req.senderAuthorizationMessage or "").startswith("TSN Cross-Chain Payment Intent\n")
    action = "Cross-Chain Payment Intent" if is_cross_chain else "Payment Intent"
    fields = _parse_canonical_message(req.senderAuthorizationMessage or "", action)
    amount_base_units = _parse_usdc_base_units(str(fields.get("Amount") or ""), "Amount")
    fee_base_units = _parse_usdc_base_units(str(fields.get("Fee") or ""), "Fee")
    recipient_tin = str(fields.get("Recipient TIN") or "")
    if not re.fullmatch(r"\d+", recipient_tin):
        raise HTTPException(400, "Recipient TIN must be plain digits in the signed message")
    if req.recipientTin and req.recipientTin != recipient_tin:
        raise HTTPException(400, "recipientTin differs from the signed message")
    if fields.get("Recipient Route Commitment") or fields.get("Recipient Route Version"):
        raise HTTPException(400, "Sender authorization must contain the recipient TIN, not resolved route data")
    token_decimals = int(get_supported_token_metadata().get(str(req.tokenMintAddress), {}).get("decimals", 6))
    request_amount_base_units = ui_amount_to_base_units(req.amount, token_decimals)
    if amount_base_units != request_amount_base_units:
        raise HTTPException(400, "amount differs from the signed message")
    request_fee_base_units = ui_amount_to_base_units(req.senderFeeAmount or 0, token_decimals, allow_zero=True)
    if fee_base_units != request_fee_base_units:
        raise HTTPException(400, "senderFeeAmount differs from the signed message")
    if req.senderAuthorizationNonce and req.senderAuthorizationNonce != fields.get("Nonce"):
        raise HTTPException(400, "senderAuthorizationNonce differs from the signed message")
    expires_at = _parse_canonical_expiry(str(fields.get("Expires") or ""))
    if req.senderAuthorizationExpiresAt:
        submitted_expiry = datetime.fromisoformat(req.senderAuthorizationExpiresAt.replace("Z", "+00:00"))
        if submitted_expiry != expires_at:
            raise HTTPException(400, "senderAuthorizationExpiresAt differs from the signed message")
    cross_chain_fields: dict[str, str] = {}
    if is_cross_chain:
        intent_id = str(fields.get("Intent ID") or "").strip()
        asset = str(fields.get("Asset") or "").strip().lower()
        destination_network = str(fields.get("Destination Network") or "").strip()
        destination_executor = str(fields.get("Destination Executor") or "").strip().lower()
        settlement_route_id = str(fields.get("Settlement Route ID") or "").strip().lower()
        if not intent_id or intent_id != req.paymentId:
            raise HTTPException(400, "Intent ID differs from the signed cross-chain intent")
        if not asset or not req.destinationToken or asset != req.destinationToken.lower():
            raise HTTPException(400, "destination asset differs from the signed cross-chain intent")
        if not destination_network or not re.fullmatch(r"[a-z0-9-]+", destination_network):
            raise HTTPException(400, "destination network is invalid")
        if not re.fullmatch(r"0x[0-9a-f]{40}", destination_executor):
            raise HTTPException(400, "destination executor must be a 20-byte EVM address")
        if not re.fullmatch(r"[0-9a-f]{64}", settlement_route_id):
            raise HTTPException(400, "settlement route ID must be a 32-byte hexadecimal commitment")
        if req.destinationNetwork and req.destinationNetwork != destination_network:
            raise HTTPException(400, "destinationNetwork differs from the signed message")
        if req.destinationExecutor and req.destinationExecutor.lower() != destination_executor:
            raise HTTPException(400, "destinationExecutor differs from the signed message")
        if req.settlementRouteId and req.settlementRouteId.lower().removeprefix("0x") != settlement_route_id:
            raise HTTPException(400, "settlementRouteId differs from the signed message")
        cross_chain_fields = {
            "destinationNetwork": destination_network,
            "destinationExecutor": destination_executor,
            "destinationToken": asset,
            "settlementRouteId": f"0x{settlement_route_id}",
        }
    sender_public_key = str(req.senderWallet or "").strip()
    _verify_ed25519_signature(
        public_key=sender_public_key,
        message=(req.senderAuthorizationMessage or "").encode("utf-8"),
        signature_base64=str(req.senderAuthorizationSignature or ""),
    )
    if not is_cross_chain:
        signed_display_name = fields.get("Recipient Display Name")
        signed_display_name_source = fields.get("Recipient Display Name Source")
        signed_credentials_json = fields.get("Recipient Verified Credentials")
        if signed_display_name is None or signed_display_name_source is None or signed_credentials_json is None:
            raise HTTPException(400, "Payment authorization must sign the resolved recipient identity")
        resolved_identity = await resolve_tin_display_identity(recipient_tin)
        if resolved_identity is None:
            raise HTTPException(422, "Recipient TIN identity could not be resolved by Node")
        resolved_display_name = str(resolved_identity.get("displayName") or "").strip() or "(not provided)"
        expected_name_source = "owner-provided" if resolved_display_name != "(not provided)" else "not provided"
        if signed_display_name != resolved_display_name or signed_display_name_source != expected_name_source:
            raise HTTPException(400, "Signed recipient display name does not match Node TIN resolution")
        try:
            signed_credentials = json.loads(signed_credentials_json)
        except (TypeError, json.JSONDecodeError) as exc:
            raise HTTPException(400, "Signed recipient credentials are invalid JSON") from exc
        if not isinstance(signed_credentials, list):
            raise HTTPException(400, "Signed recipient credentials must be a list")
        node_credentials = resolved_identity.get("verifiedCredentials") or []
        canonical_credentials = lambda value: json.dumps(
            value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
        if canonical_credentials(signed_credentials) != canonical_credentials(node_credentials):
            raise HTTPException(400, "Signed recipient credentials do not match Node-verified credentials")
    await _assert_canonical_nonce_unused(
        action=action,
        authorization_domain=str(fields.get("Domain") or "").strip(),
        sender_public_key=sender_public_key,
        nonce=str(fields.get("Nonce") or "").strip(),
    )
    if is_cross_chain:
        try:
            await verify_destination_route(
                network=cross_chain_fields["destinationNetwork"],
                route_id=cross_chain_fields["settlementRouteId"],
                executor=cross_chain_fields["destinationExecutor"],
                token=cross_chain_fields["destinationToken"],
                requested_amount=amount_base_units,
                now_seconds=int(time.time()),
            )
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(409, f"destination route preflight failed: {exc}") from exc
    route = await read_onchain_tin_tcap_relationship(recipient_tin)
    if not route:
        raise HTTPException(422, "Recipient TIN has no active TCAP route")
    _assert_recipient_hash_matches_owner(req.recipientHash, str(route.get("ownerPubkeyHash") or ""))
    recipient_route_commitment = str(route["tcapRelationshipCommitment"]).lower()
    recipient_route_version = int(route["tcapRouteVersion"])
    return {
        "recipientTin": recipient_tin,
        "recipientRouteCommitment": recipient_route_commitment,
        "recipientRouteVersion": recipient_route_version,
        "senderAuthorizationNonce": str(fields["Nonce"]),
        "senderAuthorizationExpiresAt": expires_at.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        **cross_chain_fields,
    }




def _normalize_tin_operation_input(payload: dict[str, Any]) -> dict[str, Any]:
    intent_type = _require_string(payload, "intent_type", "intentType")
    if intent_type != "tin_creation":
        raise HTTPException(422, "Only current private TIN V1 creation is supported")
    intent_id = str(_field(payload, "intent_id", "intentId", default=str(uuid4()))).strip()
    if not intent_id:
        raise HTTPException(422, "intent_id must not be empty")
    if str(_field(payload, "tin", default="") or "").strip():
        raise HTTPException(422, "TIN V1 creation must not submit a plaintext TIN")
    if str(_field(payload, "display_name", "displayName", default="") or "").strip():
        raise HTTPException(422, "TIN V1 creation must keep the display name encrypted")

    owner_pubkey = _require_string(payload, "owner_pubkey", "ownerPubkey")
    owner_bytes = _decode_owner_pubkey(owner_pubkey)
    owner_signature = _require_string(payload, "owner_signature", "ownerSignature")
    signature_bytes = _decode_base64_blob(owner_signature, "owner_signature")
    if len(signature_bytes) != 64:
        raise HTTPException(422, "owner_signature must be a 64-byte Ed25519 signature")
    owner_intent_hash = _require_string(payload, "owner_intent_hash", "ownerIntentHash")
    intent_hash_bytes = _decode_hash32(owner_intent_hash, "owner_intent_hash")
    nonce = _require_string(payload, "nonce")
    nonce_bytes = _decode_hash32(nonce, "nonce")
    expiry = _expiry_from_input(_field(payload, "expiry", "expiry_ts", "expiryTs"))

    lookup_commitment = _require_string(payload, "lookup_commitment", "lookupCommitment")
    lookup_commitment_bytes = _decode_hash32(lookup_commitment, "lookup_commitment")
    encrypted_identity_envelope = _require_string(payload, "encrypted_identity_envelope", "encryptedIdentityEnvelope")
    encrypted_identity_bytes = _decode_base64_blob(encrypted_identity_envelope, "encrypted_identity_envelope")
    encrypted_tin_recovery = _require_string(payload, "encrypted_tin_recovery", "encryptedTinRecovery")
    encrypted_tin_recovery_bytes = _decode_base64_blob(encrypted_tin_recovery, "encrypted_tin_recovery")
    encrypted_master_seed = _require_string(payload, "encrypted_master_seed", "encryptedMasterSeed")
    encrypted_master_seed_bytes = _decode_base64_blob(encrypted_master_seed, "encrypted_master_seed")
    if not encrypted_identity_bytes or len(encrypted_tin_recovery_bytes) < 28 or not encrypted_master_seed_bytes:
        raise HTTPException(422, "TIN V1 encrypted identity, recovery, and owner seed envelopes are required")

    encrypted_metadata_hash = _require_string(payload, "encrypted_metadata_hash", "encryptedMetadataHash")
    metadata_hash_bytes = _decode_hash32(encrypted_metadata_hash, "encrypted_metadata_hash")
    route_version = int(_field(payload, "route_version", "routeVersion", default=0))
    if route_version != 1:
        raise HTTPException(422, "Current TIN V1 route version must be 1")
    route_nonce = _require_string(payload, "route_nonce", "routeNonce")
    route_nonce_bytes = _decode_hash32(route_nonce, "route_nonce")
    if not secrets.compare_digest(route_nonce_bytes, nonce_bytes):
        raise HTTPException(422, "TIN V1 route nonce must match the signed operation nonce")
    tcap_route_version = int(_field(payload, "tcap_route_version", "tcapRouteVersion", default=0))
    if tcap_route_version != 1:
        raise HTTPException(422, "Current TIN V1 requires TCap route version 1")
    tcap_relationship_commitment = _decode_hash32(_field(payload, "tcap_relationship_commitment", "tcapRelationshipCommitment", default=""), "tcap_relationship_commitment")
    tcap_relationship_reference = _decode_hash32(_field(payload, "tcap_relationship_reference", "tcapRelationshipReference", default=""), "tcap_relationship_reference")
    tcap_policy_commitment = _decode_hash32(_field(payload, "tcap_policy_commitment", "tcapPolicyCommitment", default=""), "tcap_policy_commitment")
    if any(value == bytes(32) for value in (tcap_relationship_commitment, tcap_relationship_reference, tcap_policy_commitment)):
        raise HTTPException(422, "TIN V1 GPRU and TCap commitments must be nonzero")
    expected_tip_root = hashlib.sha256(b"TSN_TCAP_TIN_TIP_ROOT_COMMITMENT_V1\0" + tcap_relationship_commitment).digest()
    if not hmac.compare_digest(expected_tip_root, tcap_relationship_reference):
        raise HTTPException(422, "TIN GPRU commitment does not match its blinded TCAP TIP seed")

    expected_hash = hashlib.sha256(b"".join([
        b"TSN_TIN_V1_CREATE", owner_bytes, lookup_commitment_bytes,
        _encode_u32_le(len(encrypted_tin_recovery_bytes)), encrypted_tin_recovery_bytes,
        _encode_u32_le(len(encrypted_identity_bytes)), encrypted_identity_bytes,
        _encode_u32_le(len(encrypted_master_seed_bytes)), encrypted_master_seed_bytes,
        metadata_hash_bytes,
        route_version.to_bytes(8, "little", signed=False), route_nonce_bytes, bytes([tcap_route_version]),
        tcap_relationship_commitment, tcap_relationship_reference, tcap_policy_commitment,
        _encode_signed_i64_le(expiry),
    ])).digest()
    if not secrets.compare_digest(expected_hash, intent_hash_bytes):
        raise HTTPException(422, "owner_intent_hash does not match the current TIN V1 creation payload")

    if len(TINS_LOOKUP_SECRET.encode("utf-8")) < 16:
        raise HTTPException(503, "TIN V1 issuer secret is not configured on the TSN Node")
    issuance_proof = _decode_hash32(_field(payload, "lookup_issuance_proof", "lookupIssuanceProof", default=""), "lookup_issuance_proof")
    proof_message = b"".join([b"TSN_TIN_V1_ISSUANCE", owner_bytes, lookup_commitment_bytes, nonce_bytes, intent_hash_bytes, _encode_signed_i64_le(expiry)])
    expected_issuance_proof = hmac.new(TINS_LOOKUP_SECRET.encode("utf-8"), proof_message, hashlib.sha256).digest()
    if not secrets.compare_digest(expected_issuance_proof, issuance_proof):
        raise HTTPException(401, "TIN V1 lookup issuance proof is invalid")

    canonical_owner_message = _canonical_tin_owner_intent_message(intent_hash_bytes)
    supplied_owner_message = str(_field(payload, "owner_intent_message", "ownerIntentMessage", default="") or "")
    if supplied_owner_message and supplied_owner_message.encode("utf-8") != canonical_owner_message:
        raise HTTPException(422, "ownerIntentMessage must be the canonical TIN owner approval message")
    try:
        VerifyKey(owner_bytes).verify(canonical_owner_message, signature_bytes)
    except BadSignatureError as exc:
        raise HTTPException(401, "owner_signature is invalid for the canonical TIN approval message") from exc

    now_iso = datetime.now(timezone.utc).isoformat()
    base: dict[str, Any] = {
        "intentId": intent_id, "intentType": "tin_creation",
        "ownerPubkey": owner_pubkey, "ownerSignature": owner_signature,
        "ownerIntentHash": owner_intent_hash.lower(), "ownerIntentMessage": canonical_owner_message.decode("utf-8"),
        "ownerSignatureMessageFormat": "readable-v1", "nonce": nonce.lower(), "expiry": expiry,
        "createdAt": now_iso, "updatedAt": now_iso, "status": "pending_verification",
        "verifierCranker": None, "submitterCranker": None, "feeMetadata": None,
        "failureReason": None, "onchainSignatures": [],
        "lookupCommitment": lookup_commitment.lower(), "encryptedIdentityEnvelope": encrypted_identity_envelope,
        "encryptedTinRecovery": encrypted_tin_recovery, "encryptedMasterSeed": encrypted_master_seed,
        "encryptedMetadataHash": encrypted_metadata_hash.lower(),
        "routeVersion": route_version, "routeNonce": route_nonce.lower(),
        "tcapRouteVersion": tcap_route_version, "tcapRelationshipCommitment": tcap_relationship_commitment.hex(),
        "tcapRelationshipReference": tcap_relationship_reference.hex(), "tcapPolicyCommitment": tcap_policy_commitment.hex(),
        "displayNameStatus": "opaque_to_node", "displayNameReadableByNode": False,
        "envelopeChecks": {
            "ownerAuthorization": {"intentHashVerified": True, "signatureVerified": True},
            "encryptedIdentityEnvelope": {"present": True, "base64Decoded": True, "includedInOwnerIntentHash": True, "ciphertextOpenedByNode": False},
            "encryptedTinRecovery": {"present": True, "base64Decoded": True, "includedInOwnerIntentHash": True, "ciphertextOpenedByNode": False},
            "encryptedMasterSeed": {"present": True, "base64Decoded": True, "includedInOwnerIntentHash": True, "ciphertextOpenedByNode": False},
            "gpruCommitment": {"present": True, "includedInOwnerIntentHash": True},
        },
    }
    return base








def _decode_base64_signature(value: str) -> bytes:
    try:
        signature = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(403, "signature is not valid base64") from exc
    if len(signature) != 64:
        raise HTTPException(403, "signature must be 64 bytes")
    return signature

def _verify_ed25519_signature(*, public_key: str, message: bytes, signature_base64: str) -> None:
    try:
        VerifyKey(decode_base58(public_key)).verify(message, _decode_base64_signature(signature_base64))
    except (BadSignatureError, ValueError) as exc:
        raise HTTPException(403, "signature verification failed") from exc














async def assert_tin_operation_can_enter(operation: dict[str, Any]) -> None:
    nonce_key = hashlib.sha256(
        f"TSN_TIN_OPERATION|{operation['intentType']}|{operation['ownerPubkey']}|{operation['nonce']}".encode("utf-8")
    ).hexdigest()
    consumed = await (await get_mempool_store()).consume_once(
        k_tin_operation_nonces(),
        nonce_key,
        json.dumps(
            {
                "domain": "TSN_TIN_OPERATION",
                "intentType": operation["intentType"],
                "ownerPubkey": operation["ownerPubkey"],
                "nonce": operation["nonce"],
                "consumedAt": datetime.now(timezone.utc).isoformat(),
            },
            separators=(",", ":"),
        ),
    )
    if not consumed:
        raise HTTPException(409, "nonce has already been used by this owner_pubkey")


# â”€â”€ GitHub archive â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

# GitHub archive contains aggregate status only; no payment identifiers or recovery records.
async def commit_epoch_to_github(epoch_number: int, intents: list, closed_at: str) -> str:
    token = os.environ["GITHUB_TOKEN"]
    def count_statuses(items: list[dict[str, Any]]) -> dict[str, int]:
        counts: dict[str, int] = {}
        for item in items:
            status = str(item.get("status") or "recorded")
            counts[status] = counts.get(status, 0) + 1
        return counts
    token_totals: dict[str, dict[str, float | int]] = {}
    for intent in intents:
        mint = str(intent.get("tokenMintAddress") or "unknown")
        row = token_totals.setdefault(mint, {"intent_count": 0, "total_amount": 0.0})
        row["intent_count"] = int(row["intent_count"]) + 1
        row["total_amount"] = float(row["total_amount"]) + float(intent.get("amount") or 0)
    record = {"epoch_number": epoch_number, "closed_at": closed_at, "privacy_model": "epoch-treasury-opaque-slot-v1", "summary": {"intent_count": len(intents), "settled_count": sum(1 for item in intents if item.get("status") in {"executed", "settled"})}, "intent_statuses": count_statuses(intents), "token_totals": token_totals}
    content_b64 = base64.b64encode((json.dumps(record, indent=2) + "\n").encode()).decode()
    file_path = f"epochs/epoch-{epoch_number}-{closed_at[:10]}.json"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    async with httpx.AsyncClient(timeout=30) as client:
        check = await client.get(f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/{file_path}", headers=headers)
        payload: dict[str, Any] = {"message": f"epoch {epoch_number} closed at {closed_at}", "content": content_b64}
        if check.status_code == 200: payload["sha"] = check.json().get("sha")
        resp = await client.put(f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/{file_path}", json=payload, headers=headers)
        if resp.status_code not in (200, 201): raise RuntimeError(f"GitHub commit failed ({resp.status_code}): {resp.text[:400]}")
        return resp.json()["content"]["html_url"]

async def close_epoch_task() -> EpochCloseResult:
    r = await get_mempool_store()
    intents = await hget_all_json(k_intents())
    state = await read_epoch_state(); epoch_number = int(state["epoch_number"]); closed_at = datetime.now(timezone.utc).isoformat()
    commit_url = await commit_epoch_to_github(epoch_number, intents, closed_at)
    rollover_intents = [i for i in intents if str(i.get("status")) not in TERMINAL_INTENT_STATUSES]
    await r.delete(k_intents())
    if rollover_intents: await r.hset(k_intents(), mapping={i["id"]: json.dumps(i) for i in rollover_intents})
    new_epoch = epoch_number + 1; await r.set(k_epoch(), json.dumps({"epoch_number": new_epoch, "started_at": closed_at}))
    settled_count = sum(1 for item in intents if item.get("status") in {"executed", "settled"})
    return EpochCloseResult(epoch_number=epoch_number, intents_archived=len(intents), settlements_archived=settled_count, intents_rolled_over=len(rollover_intents), intents_pruned=len(intents)-len(rollover_intents), settlements_pruned=settled_count, github_commit_url=commit_url, new_epoch_number=new_epoch, message=f"Epoch {epoch_number} archived; epoch {new_epoch} started.")


def _tcap_credit_bytes32(value: Any, label: str) -> bytes:
    text = str(value or "").lower()
    if not re.fullmatch(r"[0-9a-f]{64}", text):
        raise ValueError(f"TCAP credit {label} must be 32-byte hex")
    return bytes.fromhex(text)


def _tcap_credit_u64(value: Any, label: str) -> bytes:
    number = int(str(value))
    if number < 0 or number > 0xFFFFFFFFFFFFFFFF:
        raise ValueError(f"TCAP credit {label} is out of range")
    return number.to_bytes(8, "little")


def _validate_tcap_credit_digest(transition: dict[str, Any]) -> str:
    root = _tcap_credit_bytes32(transition.get("tipRootCommitment"), "tipRootCommitment")
    previous = _tcap_credit_bytes32(transition.get("previousCommitment"), "previousCommitment")
    successor = _tcap_credit_bytes32(transition.get("newCommitment"), "newCommitment")
    policy = _tcap_credit_bytes32(transition.get("policyCommitment"), "policyCommitment")
    scope = _tcap_credit_bytes32(transition.get("gpruScopeCommitment"), "gpruScopeCommitment")
    nonce = _tcap_credit_bytes32(transition.get("nullifier"), "nullifier")
    sequence = _tcap_credit_u64(transition.get("sequence"), "sequence")
    valid_after = _tcap_credit_u64(transition.get("validAfterSlot"), "validAfterSlot")
    expires = _tcap_credit_u64(transition.get("expiresAtSlot"), "expiresAtSlot")
    token_id = int(transition.get("tokenId") or 0)
    if token_id <= 0 or token_id > 0xFFFFFFFF:
        raise ValueError("TCAP credit tokenId is out of range")
    amount_base_units = int(str(transition.get("amountBaseUnits") or transition.get("amount") or "0"))
    if amount_base_units <= 0 or amount_base_units > 0xFFFFFFFFFFFFFFFF:
        raise ValueError("TCAP credit amountBaseUnits is out of range")
    if int.from_bytes(sequence, "little") <= 0 or int.from_bytes(expires, "little") < int.from_bytes(valid_after, "little"):
        raise ValueError("TCAP credit sequence or validity window is invalid")
    if successor == bytes(32) or nonce == bytes(32) or policy == bytes(32) or scope == bytes(32):
        raise ValueError("TCAP GPRU transition commitments must be nonzero")
    tcap_program = Pubkey.from_string(TCAP_PROGRAM_ID)
    tip, _ = Pubkey.find_program_address([b"tcap:tin-tip:v1", root], tcap_program)
    expected_amount_commitment = hashlib.sha256(
        b"TSN_TCAP_CREDIT_AMOUNT_V2"
        + amount_base_units.to_bytes(8, "little")
        + token_id.to_bytes(4, "little")
    ).digest()
    supplied_amount_commitment = transition.get("amountCommitment")
    if supplied_amount_commitment is not None and not hmac.compare_digest(
        _tcap_credit_bytes32(supplied_amount_commitment, "amountCommitment"),
        expected_amount_commitment,
    ):
        raise ValueError("TCAP GPRU amount commitment differs from the verified credit amount")
    expected_successor = hashlib.sha256(
        b"TSN_TCAP_CREDIT_COMMITMENT_V2"
        + root
        + previous
        + sequence
        + token_id.to_bytes(4, "little")
        + policy
        + expected_amount_commitment
    ).digest()
    if not hmac.compare_digest(successor, expected_successor):
        raise ValueError("TCAP GPRU successor does not commit to the credit amount")
    expected_scope = hashlib.sha256(
        b"TSN_GPRU_TCAP_CREDIT_SCOPE_V2" + root + previous + successor + sequence
        + token_id.to_bytes(4, "little") + policy + nonce
    ).digest()
    if not hmac.compare_digest(scope, expected_scope):
        raise ValueError("TCAP GPRU scope commitment does not match the authorized credit transition")
    expected = hashlib.sha256(
        b"TSN_GPRU_TCAP_CREDIT_V2" + bytes(tip) + valid_after + expires + previous + successor
        + sequence + token_id.to_bytes(4, "little") + policy + scope + nonce
    ).hexdigest()
    supplied = str(transition.get("authorizationDigest") or "").lower()
    if not hmac.compare_digest(expected, supplied):
        raise ValueError("TCAP GPRU credit authorization digest does not match the deployed V2 program contract")
    transition["tipRootCommitment"] = root.hex()
    return str(tip)


async def _simulate_owner_signed_tcap_deposit(transaction_base64: str) -> dict[str, Any]:
    """Ask the configured Solana program to validate the exact signed deposit without submitting it."""
    try:
        wire = base64.b64decode(transaction_base64, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("Owner-signed TCAP deposit transaction is not valid base64") from exc
    if not wire or base64.b64encode(wire).decode("ascii") != transaction_base64:
        raise ValueError("Owner-signed TCAP deposit transaction encoding is invalid")
    params = [
        base64.b64encode(wire).decode("ascii"),
        {
            "encoding": "base64",
            "commitment": "confirmed",
            "sigVerify": True,
            "replaceRecentBlockhash": False,
        },
    ]
    last_blockhash_error: Any = None
    last_rpc_error: Exception | None = None
    async with httpx.AsyncClient(timeout=12) as client:
        for rpc_url in TSN_SOLANA_RPC_URLS:
            try:
                response = await client.post(rpc_url, json={
                    "jsonrpc": "2.0", "id": 1, "method": "simulateTransaction", "params": params,
                })
                response.raise_for_status()
                rpc_response = response.json()
            except (httpx.HTTPError, ValueError) as exc:
                last_rpc_error = exc
                continue
            if rpc_response.get("error"):
                last_rpc_error = RuntimeError(str(rpc_response["error"]))
                continue
            value = ((rpc_response.get("result") or {}).get("value"))
            if not isinstance(value, dict):
                last_rpc_error = ValueError("Solana RPC returned no TCAP deposit simulation result")
                continue
            simulation_error = value.get("err")
            blockhash_not_found = (
                simulation_error == "BlockhashNotFound"
                or isinstance(simulation_error, dict) and "BlockhashNotFound" in simulation_error
            )
            if blockhash_not_found:
                last_blockhash_error = simulation_error
                continue
            if simulation_error is not None:
                logs = value.get("logs") or []
                detail = "; ".join(str(line) for line in logs[-8:])
                raise ValueError(f"Deployed TCAP program rejected the signed deposit during simulation: {detail or simulation_error}")
            return {
                "programSimulation": "PASSED",
                "computeUnitsConsumed": value.get("units"),
            }
    if last_blockhash_error is not None:
        raise ValueError("Signed deposit blockhash was not recognized by any configured Solana RPC endpoint; prepare and sign a fresh deposit transaction")
    raise HTTPException(503, "Solana RPC is unavailable while simulating the signed TCAP deposit") from last_rpc_error


def _read_solana_shortvec(data: bytes, offset: int) -> tuple[int, int]:
    value = 0
    shift = 0
    while offset < len(data) and shift <= 21:
        byte = data[offset]
        offset += 1
        value |= (byte & 0x7F) << shift
        if byte < 0x80:
            return value, offset
        shift += 7
    raise ValueError("Signed TCAP deposit has an invalid compact length")


def _parse_solana_legacy_message(message: bytes) -> tuple[int, int, int, list[str], bytes, list[tuple[str, list[str], bytes]]]:
    if len(message) < 3 or message[0] & 0x80:
        raise ValueError("Mother signing accepts only legacy Solana transaction messages")
    required_signatures, readonly_signed, readonly_unsigned = message[:3]
    account_count, cursor = _read_solana_shortvec(message, 3)
    if account_count == 0 or cursor + account_count * 32 + 32 > len(message):
        raise ValueError("Mother signing transaction message has an invalid account list")
    account_keys = [
        str(Pubkey(message[cursor + index * 32:cursor + (index + 1) * 32]))
        for index in range(account_count)
    ]
    cursor += account_count * 32
    recent_blockhash = message[cursor:cursor + 32]
    cursor += 32
    instruction_count, cursor = _read_solana_shortvec(message, cursor)
    instructions: list[tuple[str, list[str], bytes]] = []
    for _ in range(instruction_count):
        if cursor >= len(message):
            raise ValueError("Mother signing transaction instructions are truncated")
        program_index = message[cursor]
        cursor += 1
        account_index_count, cursor = _read_solana_shortvec(message, cursor)
        if cursor + account_index_count > len(message):
            raise ValueError("Mother signing transaction account indexes are truncated")
        account_indexes = list(message[cursor:cursor + account_index_count])
        cursor += account_index_count
        data_length, cursor = _read_solana_shortvec(message, cursor)
        if cursor + data_length > len(message):
            raise ValueError("Mother signing transaction instruction data is truncated")
        data = message[cursor:cursor + data_length]
        cursor += data_length
        if program_index >= len(account_keys) or any(index >= len(account_keys) for index in account_indexes):
            raise ValueError("Mother signing transaction references an invalid account index")
        instructions.append((account_keys[program_index], [account_keys[index] for index in account_indexes], data))
    if cursor != len(message) or len(set(account_keys)) != len(account_keys):
        raise ValueError("Mother signing transaction has trailing data or duplicate account keys")
    return required_signatures, readonly_signed, readonly_unsigned, account_keys, recent_blockhash, instructions


def _mother_authority_signing_key() -> SigningKey:
    if not TSN_MOTHER_AUTHORITY_KEYPAIR_PATH:
        raise HTTPException(503, "Mother Node signing is not configured")
    key_path = Path(TSN_MOTHER_AUTHORITY_KEYPAIR_PATH).expanduser()
    if not key_path.is_absolute():
        key_path = _node_root / key_path
    try:
        secret = json.loads(key_path.read_text(encoding="utf-8"))
        if not isinstance(secret, list) or len(secret) != 64 or any(
            not isinstance(value, int) or value < 0 or value > 255 for value in secret
        ):
            raise ValueError("keypair must be a 64-byte Solana JSON keypair")
        signing_key = SigningKey(bytes(secret[:32]))
        if not hmac.compare_digest(bytes(signing_key.verify_key), bytes(secret[32:])):
            raise ValueError("keypair public key does not match its private seed")
        return signing_key
    except (OSError, json.JSONDecodeError, TypeError, ValueError) as exc:
        raise HTTPException(503, "Mother Node signing keypair is unavailable or invalid") from exc


async def _assert_mother_authority_key_matches_chain(signing_key: SigningKey) -> str:
    mother = get_mother_escrow_pda()
    response = await solana_rpc("getAccountInfo", [str(mother), {"encoding": "base64", "commitment": "confirmed"}])
    account = ((response.get("result") or {}).get("value"))
    if not isinstance(account, dict) or str(account.get("owner") or "") != TSN_PROGRAM_ID:
        raise HTTPException(503, "Mother Escrow is missing or not owned by the configured TSN program")
    try:
        data = base64.b64decode((account.get("data") or [""])[0], validate=True)
    except (ValueError, TypeError, binascii.Error) as exc:
        raise HTTPException(503, "Mother Escrow account data is invalid") from exc
    expected_discriminator = hashlib.sha256(b"account:MotherEscrow").digest()[:8]
    if len(data) < 40 or data[:8] != expected_discriminator:
        raise HTTPException(503, "Mother Escrow account layout is invalid")
    authority = data[8:40]
    if not hmac.compare_digest(authority, bytes(signing_key.verify_key)):
        raise HTTPException(403, "Mother Node key does not match the on-chain Mother authority")
    return str(Pubkey(authority))


def _verify_mother_signed_tcap_settlement_message(
    message: bytes,
    *,
    operator: str,
    authority: str,
    transition: dict[str, Any],
) -> bytes:
    required_signatures, readonly_signed, readonly_unsigned, account_keys, recent_blockhash, instructions = _parse_solana_legacy_message(message)
    if required_signatures != 2 or readonly_signed != 0 or len(account_keys) < required_signatures:
        raise HTTPException(422, "Settlement transaction must have exactly Cranker and Mother writable signers")
    if account_keys[0] != operator or account_keys[1] != authority:
        raise HTTPException(403, "Settlement transaction signer order does not match its leased Cranker and Mother")
    if not any(recent_blockhash):
        raise HTTPException(422, "Settlement transaction has no recent blockhash")

    tip_root = _tcap_credit_bytes32(transition.get("tipRootCommitment"), "tipRootCommitment")
    authorization_digest = _tcap_credit_bytes32(transition.get("authorizationDigest"), "authorizationDigest")
    try:
        token_id = int(transition.get("tokenId"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, "Node TCAP transition tokenId is invalid") from exc
    if token_id <= 0 or token_id > 0xFFFFFFFF:
        raise HTTPException(422, "Node TCAP transition tokenId is outside the u32 range")
    args = b"".join((
        authorization_digest,
        _tcap_credit_u64(transition.get("validAfterSlot"), "validAfterSlot"),
        _tcap_credit_u64(transition.get("expiresAtSlot"), "expiresAtSlot"),
        _tcap_credit_bytes32(transition.get("previousCommitment"), "previousCommitment"),
        _tcap_credit_bytes32(transition.get("newCommitment"), "newCommitment"),
        _tcap_credit_u64(transition.get("sequence"), "sequence"),
        token_id.to_bytes(4, "little"),
        _tcap_credit_bytes32(transition.get("policyCommitment"), "policyCommitment"),
        _tcap_credit_bytes32(transition.get("gpruScopeCommitment"), "gpruScopeCommitment"),
        _tcap_credit_bytes32(transition.get("nullifier"), "nullifier"),
    ))
    tsn_program = Pubkey.from_string(TSN_PROGRAM_ID)
    tcap_program = Pubkey.from_string(TCAP_PROGRAM_ID)
    mother_escrow = get_mother_escrow_pda()
    tip = Pubkey.from_string(str(transition.get("tip") or ""))
    asset_entry = Pubkey.from_string(str(transition.get("assetEntry") or ""))
    config = Pubkey.from_string(str(transition.get("tcapConfig") or ""))
    tip_root_account = Pubkey(tip_root)
    auth_signer = Pubkey.find_program_address(
        [b"tsn:tcap-authorization:v1", authorization_digest], tsn_program,
    )[0]
    system_program = Pubkey.from_string("11111111111111111111111111111111")
    register_instruction = (
        TSN_PROGRAM_ID,
        [
            authority, str(mother_escrow), str(tcap_program), TSN_PROGRAM_ID,
            str(config), str(asset_entry), str(tip_root_account), str(tip),
            str(auth_signer), str(system_program),
        ],
        hashlib.sha256(b"global:tsn_register_tcap_credit_authorization_v2").digest()[:8] + args,
    )
    expected_instructions: list[tuple[str, list[str], bytes]] = []
    expected_keys = {
        operator, authority, str(mother_escrow), str(tcap_program), TSN_PROGRAM_ID,
        str(config), str(asset_entry), str(tip_root_account), str(tip), str(auth_signer),
        str(system_program),
    }
    if transition.get("initializeTip") is True:
        initial = _tcap_credit_bytes32(transition.get("initialCommitment"), "initialCommitment")
        cranker_pda = get_cranker_pda(Pubkey.from_string(operator))
        initialize_data = (
            hashlib.sha256(b"global:initialize_tcap_tin_tip_v1").digest()[:8]
            + tip_root
            + initial
            + _tcap_credit_bytes32(transition.get("policyCommitment"), "policyCommitment")
        )
        expected_instructions.append((
            TCAP_PROGRAM_ID,
            [operator, str(mother_escrow), str(cranker_pda), str(tip), str(system_program)],
            initialize_data,
        ))
        expected_keys.add(str(cranker_pda))
    expected_instructions.append(register_instruction)
    if instructions != expected_instructions or set(account_keys) != expected_keys:
        raise HTTPException(403, "Settlement transaction does not exactly match the Node-verified TCAP transition")
    writable_unsigned_count = len(account_keys) - required_signatures - readonly_unsigned
    expected_writable_unsigned = {str(tip)}
    if writable_unsigned_count < 0 or set(account_keys[required_signatures:required_signatures + writable_unsigned_count]) != expected_writable_unsigned:
        raise HTTPException(422, "Settlement transaction has unexpected writable accounts")
    return recent_blockhash


def _parse_signed_tcap_deposit_instructions(transaction_base64: str) -> list[tuple[str, list[str], bytes]]:
    try:
        wire = base64.b64decode(transaction_base64, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("Owner-signed TCAP deposit transaction is invalid base64") from exc
    if not wire or base64.b64encode(wire).decode("ascii") != transaction_base64:
        raise ValueError("Owner-signed TCAP deposit transaction encoding is not canonical")
    signature_count, offset = _read_solana_shortvec(wire, 0)
    if signature_count < 1 or offset + signature_count * 64 >= len(wire):
        raise ValueError("Owner-signed TCAP deposit transaction has no wallet signature")
    message = wire[offset + signature_count * 64:]
    cursor = 0
    if not message or message[0] & 0x80:
        raise ValueError("Versioned TCAP funding transactions are not accepted by the current Node verifier")
    if len(message) < 3:
        raise ValueError("Signed TCAP deposit message header is incomplete")
    required_signatures = message[0]
    cursor = 3
    account_count, cursor = _read_solana_shortvec(message, cursor)
    if required_signatures != signature_count or account_count == 0 or cursor + account_count * 32 + 32 > len(message):
        raise ValueError("Signed TCAP deposit message header is inconsistent")
    account_keys = [str(Pubkey(message[cursor + index * 32:cursor + (index + 1) * 32])) for index in range(account_count)]
    cursor += account_count * 32 + 32  # static keys and recent blockhash
    instruction_count, cursor = _read_solana_shortvec(message, cursor)
    instructions: list[tuple[str, list[str], bytes]] = []
    for _ in range(instruction_count):
        if cursor >= len(message):
            raise ValueError("Signed TCAP deposit instruction list is truncated")
        program_index = message[cursor]
        cursor += 1
        account_index_count, cursor = _read_solana_shortvec(message, cursor)
        if cursor + account_index_count > len(message):
            raise ValueError("Signed TCAP deposit account list is truncated")
        indexes = list(message[cursor:cursor + account_index_count])
        cursor += account_index_count
        data_length, cursor = _read_solana_shortvec(message, cursor)
        if cursor + data_length > len(message) or program_index >= len(account_keys) or any(index >= len(account_keys) for index in indexes):
            raise ValueError("Signed TCAP deposit instruction data is truncated or references an invalid key")
        data = message[cursor:cursor + data_length]
        cursor += data_length
        instructions.append((account_keys[program_index], [account_keys[index] for index in indexes], data))
    if cursor != len(message):
        raise ValueError("Signed TCAP deposit message contains unsupported trailing data")
    return instructions


def _verify_signed_tcap_deposit_contract(
    *, transaction_base64: str, transition: dict[str, Any], wallet: str, tip_address: str,
    initialize_tip: bool,
) -> None:
    accounts = transition.get("depositAccounts")
    if not isinstance(accounts, dict):
        raise ValueError("TCAP deposit account contract is missing")
    amount = int(str(transition.get("depositAmountBaseUnits") or "0"))
    expected_deposit_accounts = [
        wallet, accounts.get("config"), accounts.get("assetEntry"),
        accounts.get("reserveState"), accounts.get("source"), accounts.get("vault"),
        accounts.get("mint"), accounts.get("tokenProgram"),
    ]
    if amount <= 0 or accounts.get("depositor") != wallet:
        raise ValueError("TCAP deposit amount or sender does not match the signed intent")
    instructions = _parse_signed_tcap_deposit_instructions(transaction_base64)
    deposit_disc = hashlib.sha256(b"global:deposit_asset_v2").digest()[:8]
    init_disc = hashlib.sha256(b"global:initialize_tcap_tin_tip_v1").digest()[:8]
    expected_instruction_count = 2 if initialize_tip else 1
    if len(instructions) != expected_instruction_count:
        requirement = (
            "the GPRU TIP initializer followed by the TCAP deposit"
            if initialize_tip
            else "the TCAP reserve deposit only; TIP initialization is deferred to settlement"
        )
        raise ValueError(f"Wallet funding transaction must contain exactly {requirement}")
    deposit = instructions[-1]
    if deposit[0] != TCAP_PROGRAM_ID or deposit[1] != expected_deposit_accounts or len(deposit[2]) != 16 or deposit[2][:8] != deposit_disc or int.from_bytes(deposit[2][8:], "little") != amount:
        raise ValueError("Wallet funding transaction does not contain the exact TCAP deposit_asset_v2 instruction")
    if initialize_tip:
        init = instructions[0]
        expected_init_accounts = [wallet, tip_address, str(Pubkey.from_string("11111111111111111111111111111111"))]
        root = _tcap_credit_bytes32(transition.get("tipRootCommitment"), "tipRootCommitment")
        previous = _tcap_credit_bytes32(transition.get("previousCommitment"), "previousCommitment")
        policy = _tcap_credit_bytes32(transition.get("policyCommitment"), "policyCommitment")
        if init[0] != TCAP_PROGRAM_ID or init[1] != expected_init_accounts or len(init[2]) != 104 or init[2][:8] != init_disc or init[2][8:40] != root or init[2][40:72] != previous or init[2][72:104] != policy:
            raise ValueError("First-credit TIP initializer does not match the recipient route and GPRU predecessor")


async def _verify_confirmed_tcap_deposit(
    *, funding_work: dict[str, Any], transition: dict[str, Any], wallet: str, token_mint: str,
) -> dict[str, Any]:
    result = funding_work.get("result") or {}
    signature = str(result.get("signature") or "")
    if not signature:
        raise ValueError("Cranker funding receipt is missing the transaction signature")
    transaction_result = await solana_rpc("getTransaction", [
        signature,
        {"encoding": "jsonParsed", "commitment": "confirmed", "maxSupportedTransactionVersion": 0},
    ])
    tx = transaction_result.get("result")
    if not isinstance(tx, dict) or tx.get("meta", {}).get("err") is not None:
        raise ValueError("TCAP deposit transaction is not confirmed successfully on Solana")
    transaction = tx.get("transaction") or {}
    if signature not in (transaction.get("signatures") or []):
        raise ValueError("TCAP deposit signature does not match the Receiver funding receipt")
    meta = tx.get("meta") or {}
    if meta.get("err") is not None:
        raise ValueError("TCAP deposit transaction failed on Solana")
    accounts = transition.get("depositAccounts")
    if not isinstance(accounts, dict):
        raise ValueError("TCAP deposit account contract is missing")
    funding_payload = funding_work.get("payload") or {}
    signed_wire = str(funding_payload.get("senderSignedFundingTransaction") or "")
    signed_instructions = _parse_signed_tcap_deposit_instructions(signed_wire)
    _verify_signed_tcap_deposit_contract(
        transaction_base64=signed_wire, transition=transition, wallet=wallet, tip_address=_validate_tcap_credit_digest(transition),
        initialize_tip=len(signed_instructions) == 2,
    )
    expected_accounts = [
        wallet, accounts.get("config"), accounts.get("assetEntry"),
        accounts.get("reserveState"), accounts.get("source"), accounts.get("vault"), token_mint,
        accounts.get("tokenProgram"),
    ]
    if accounts.get("depositor") != wallet or accounts.get("mint") != token_mint:
        raise ValueError("TCAP deposit owner or mint differs from the signed request")
    amount = int(str(transition.get("depositAmountBaseUnits") or "0"))
    if amount <= 0:
        raise ValueError("TCAP deposit amount must be positive")
    discriminator = hashlib.sha256(b"global:deposit_asset_v2").digest()[:8]
    matching = []
    decoded_instructions: list[tuple[str, list[str], bytes]] = []
    instructions = (transaction.get("message") or {}).get("instructions") or []
    for instruction in instructions:
        try:
            data = decode_base58(str(instruction.get("data") or ""))
        except ValueError:
            continue
        decoded_instructions.append((str(instruction.get("programId") or ""), list(instruction.get("accounts") or []), data))
        if str(instruction.get("programId") or "") == TCAP_PROGRAM_ID and len(data) == 16 and data[:8] == discriminator:
            if list(instruction.get("accounts") or []) == expected_accounts and int.from_bytes(data[8:], "little") == amount:
                matching.append(instruction)
    if len(matching) != 1:
        raise ValueError("Confirmed transaction does not contain the exact signed TCAP V2 deposit instruction")
    if len(decoded_instructions) != len(signed_instructions):
        raise ValueError("Confirmed TCAP reserve deposit instruction count differs from the wallet-signed transaction")
    return {"signature": signature, "slot": int(tx.get("slot") or 0), "amountBaseUnits": str(amount), "mint": token_mint}


async def _assert_tcap_tip_predecessor(
    transition: dict[str, Any], tip_address: str, *, allow_missing: bool = False,
) -> bool:
    response = await solana_rpc("getAccountInfo", [tip_address, {"encoding": "base64", "commitment": "confirmed"}])
    account = ((response.get("result") or {}).get("value"))
    if account is None and allow_missing:
        return False
    if not isinstance(account, dict) or str(account.get("owner") or "") != TCAP_PROGRAM_ID:
        raise ValueError("TCAP TIN tip account is missing or owned by another program")
    encoded = (account.get("data") or [None])[0]
    if not encoded:
        raise ValueError("TCAP TIN tip account data is missing")
    try:
        data = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("TCAP TIN tip account data is invalid") from exc
    expected_discriminator = hashlib.sha256(b"account:TCapTinTipV1").digest()[:8]
    if len(data) != 116 or data[:8] != expected_discriminator:
        raise ValueError("TCAP V2 TIN TIP account layout is invalid")
    current_commitment = data[10:42]
    sequence = int.from_bytes(data[42:50], "little")
    policy = data[50:82]
    transition_nullifier = data[82:114]
    nonce = _tcap_credit_bytes32(transition.get("nullifier"), "nullifier")
    expected_previous = _tcap_credit_bytes32(transition.get("previousCommitment"), "previousCommitment")
    expected_policy = _tcap_credit_bytes32(transition.get("policyCommitment"), "policyCommitment")
    expected_sequence = int(str(transition.get("sequence") or "0"))
    if data[114] != 0 or sequence + 1 != expected_sequence or current_commitment != expected_previous or policy != expected_policy or transition_nullifier == nonce:
        raise ValueError("TCAP V2 TIP predecessor does not match the sequence, policy, or commitments")
    return True


async def _assert_tcap_gpru_credit_program_preconditions(
    transition: dict[str, Any], tip_address: str,
) -> None:
    """Mirror the deployed V2 GPRU credit account constraints before release."""
    accounts = transition.get("depositAccounts")
    accounts = accounts if isinstance(accounts, dict) else {}
    config_address = str(transition.get("tcapConfig") or accounts.get("config") or "")
    asset_entry_address = str(transition.get("assetEntry") or accounts.get("assetEntry") or "")
    if not all((config_address, asset_entry_address)):
        raise ValueError("TCAP config and asset entry addresses are required")

    tcap_program = Pubkey.from_string(TCAP_PROGRAM_ID)
    tsn_program = Pubkey.from_string(TSN_PROGRAM_ID)
    canonical_config, _ = Pubkey.find_program_address([b"tcap:global-config:v1"], tcap_program)
    if config_address != str(canonical_config):
        raise ValueError("TCAP config address is not the canonical program PDA")
    asset_entry = Pubkey.from_string(asset_entry_address)
    addresses = [config_address, tip_address, asset_entry_address]
    response = await solana_rpc(
        "getMultipleAccounts",
        [addresses, {"encoding": "base64", "commitment": "confirmed"}],
    )
    values = ((response.get("result") or {}).get("value"))
    if not isinstance(values, list) or len(values) != len(addresses):
        raise ValueError("TCAP preflight RPC returned an incomplete account set")
    slot = int(((response.get("result") or {}).get("context") or {}).get("slot") or 0)
    valid_after_slot = int(str(transition.get("validAfterSlot") or "0"))
    expires_at_slot = int(str(transition.get("expiresAtSlot") or "0"))
    if slot < valid_after_slot or slot > expires_at_slot:
        raise ValueError("TCAP credit authorization is outside the deployed program's slot validity window")

    decoded: list[tuple[str, bytes] | None] = []
    for address, account in zip(addresses, values):
        if account is None:
            decoded.append(None)
            continue
        if str(account.get("owner") or "") != TCAP_PROGRAM_ID:
            raise ValueError(f"TCAP preflight account has the wrong owner: {address}")
        data = (account.get("data") or [None])[0]
        if not isinstance(data, str):
            raise ValueError(f"TCAP preflight account has invalid data: {address}")
        try:
            raw = base64.b64decode(data, validate=True)
        except (ValueError, binascii.Error) as exc:
            raise ValueError(f"TCAP preflight account data is not valid base64: {address}") from exc
        decoded.append((str(account.get("owner")), raw))

    config_record = decoded[0]
    tip_record = decoded[1]
    asset_record = decoded[2]
    initialize_tip = bool(transition.get("initializeTip"))
    if config_record is None or asset_record is None or (tip_record is None and not initialize_tip):
        raise ValueError("TCAP config, TIN TIP, or asset entry is missing")
    config_data = config_record[1]
    if len(config_data) < 244 or config_data[:8] != hashlib.sha256(b"account:TcapGlobalConfigV1").digest()[:8]:
        raise ValueError("TCAP global config has an unsupported account layout")
    if config_data[207] != 0:
        raise ValueError("TCAP protocol is paused")
    if config_data[142:174] != bytes(tsn_program):
        raise ValueError("TCAP config does not approve the configured TSN program")

    if tip_record is None:
        initial = _tcap_credit_bytes32(transition.get("initialCommitment"), "initialCommitment")
        if (
            not initialize_tip
            or int(str(transition.get("sequence") or "0")) != 1
            or initial != _tcap_credit_bytes32(transition.get("previousCommitment"), "previousCommitment")
        ):
            raise ValueError("Missing TCAP TIP is not authorized for first-credit initialization")
    else:
        tip_data = tip_record[1]
        if len(tip_data) != 116 or tip_data[:8] != hashlib.sha256(b"account:TCapTinTipV1").digest()[:8]:
            raise ValueError("TCAP V2 TIN TIP account layout is invalid")
        if int.from_bytes(tip_data[8:10], "little") != 1 or tip_data[114] != 0:
            raise ValueError("TCAP V2 TIN TIP is unsupported or frozen")
        if (
            tip_data[10:42] != _tcap_credit_bytes32(transition.get("previousCommitment"), "previousCommitment")
            or int.from_bytes(tip_data[42:50], "little") + 1 != int(str(transition.get("sequence") or "0"))
            or tip_data[50:82] != _tcap_credit_bytes32(transition.get("policyCommitment"), "policyCommitment")
            or tip_data[82:114] == _tcap_credit_bytes32(transition.get("nullifier"), "nullifier")
        ):
            raise ValueError("TCAP V2 TIP changed after Node verification")

    asset_data = asset_record[1]
    if len(asset_data) < 287 or asset_data[:8] != hashlib.sha256(b"account:TcapAssetEntryV1").digest()[:8]:
        raise ValueError("TCAP asset entry has an unsupported account layout")
    token_id = int.from_bytes(asset_data[44:48], "little")
    token_program = Pubkey(asset_data[48:80])
    mint = Pubkey(asset_data[80:112])
    expected_entry, _ = Pubkey.find_program_address(
        [b"tcap:asset-entry:v1", asset_data[12:44], bytes(token_program), bytes(mint)],
        tcap_program,
    )
    if str(expected_entry) != asset_entry_address:
        raise ValueError("TCAP asset entry is not the PDA for its registry, token program, and mint")
    if asset_data[12:44] != config_data[78:110]:
        raise ValueError("TCAP asset entry is not in the registry bound to global config")
    if token_id != int(transition.get("tokenId") or 0):
        raise ValueError("TCAP asset entry token ID differs from the authorized credit")
    if asset_data[283] != 1 or asset_data[284] != 1 or asset_data[247] != 0 or asset_data[285] != 0:
        raise ValueError("TCAP asset is not active, approved, and unpaused")


async def _construct_node_owned_tcap_transition(request: CreateIntentRequest, verified_fields: dict[str, Any]) -> dict[str, Any]:
    """Build only the opaque fields accepted by TCAP V2; no recipient key or envelope is created."""
    funding = str(request.senderSignedFundingTransaction or "")
    if not funding:
        raise ValueError("Owner-signed TCAP reserve deposit transaction is missing")
    tin = str(verified_fields["recipientTin"])
    relation = await read_onchain_tin_tcap_relationship(tin)
    if not relation:
        raise ValueError("Recipient TIN has no active on-chain TCAP relationship")
    if int(relation.get("tcapRouteVersion") or 0) != int(verified_fields["recipientRouteVersion"]):
        raise ValueError("Recipient route version differs from the signed authorization")
    if not hmac.compare_digest(str(relation.get("tcapRelationshipCommitment") or "").lower(), str(verified_fields["recipientRouteCommitment"]).lower()):
        raise ValueError("Recipient route commitment differs from the signed authorization")
    root = _tcap_credit_bytes32(relation.get("tcapRelationshipReference"), "tipRootCommitment")
    policy = _tcap_credit_bytes32(relation.get("tcapPolicyCommitment"), "policyCommitment")
    instructions = _parse_signed_tcap_deposit_instructions(funding)
    if len(instructions) != 1:
        raise ValueError("TCAP reserve deposit must contain exactly one deposit instruction")
    program, accounts, data = instructions[0]
    if program != TCAP_PROGRAM_ID or len(accounts) != 8 or len(data) != 16:
        raise ValueError("Signed transaction is not a TCAP reserve deposit")
    amount = int.from_bytes(data[8:], "little")
    decimals = int(get_supported_token_metadata().get(str(request.tokenMintAddress), {}).get("decimals", 6))
    expected_amount = ui_amount_to_base_units(request.amount, decimals)
    if amount != expected_amount:
        raise ValueError("TCAP deposit amount differs from the signed payment amount")
    asset_entry = accounts[2]
    asset_response = await solana_rpc("getAccountInfo", [asset_entry, {"encoding": "base64", "commitment": "confirmed"}])
    asset = ((asset_response.get("result") or {}).get("value"))
    raw = base64.b64decode((asset or {}).get("data", [""])[0], validate=True) if asset else b""
    if len(raw) < 48 or raw[:8] != hashlib.sha256(b"account:TcapAssetEntryV1").digest()[:8]:
        raise ValueError("TCAP asset entry is missing or invalid")
    token_id = int.from_bytes(raw[44:48], "little")
    slot_response = await solana_rpc("getSlot", [{"commitment": "confirmed"}])
    valid_after = int((slot_response.get("result") or 0))
    sequence = 1
    tip, _ = Pubkey.find_program_address([b"tcap:tin-tip:v1", root], Pubkey.from_string(TCAP_PROGRAM_ID))
    tip_response = await solana_rpc("getAccountInfo", [str(tip), {"encoding": "base64", "commitment": "confirmed"}])
    tip_result = tip_response.get("result")
    if not isinstance(tip_result, dict) or "value" not in tip_result:
        raise ValueError("Solana RPC returned no TCAP TIN TIP account state")
    tip_value = tip_result["value"]
    initial_commitment = _tcap_credit_bytes32(relation.get("gpruCommitment"), "initialCommitment")
    initialize_tip = tip_value is None
    if initialize_tip:
        # The owner-derived GPRU commitment is the initial opaque TIP predecessor.
        # The TIP account itself is created later, atomically with settlement.
        previous = initial_commitment
        sequence = 1
    else:
        if not isinstance(tip_value, dict) or str(tip_value.get("owner") or "") != TCAP_PROGRAM_ID:
            raise ValueError("TCAP TIN TIP account is owned by another program")
        tip_raw = base64.b64decode((tip_value.get("data") or [""])[0], validate=True)
        if len(tip_raw) != 116 or tip_raw[:8] != hashlib.sha256(b"account:TCapTinTipV1").digest()[:8]:
            raise ValueError("TCAP TIN TIP account layout is invalid")
        previous = tip_raw[10:42]
        sequence = int.from_bytes(tip_raw[42:50], "little") + 1
    nullifier = hashlib.sha256(b"TSN_TCAP_CREDIT_NULLIFIER_V2" + funding.encode()).digest()
    amount_commitment = hashlib.sha256(b"TSN_TCAP_CREDIT_AMOUNT_V2" + amount.to_bytes(8, "little") + token_id.to_bytes(4, "little")).digest()
    successor = hashlib.sha256(b"TSN_TCAP_CREDIT_COMMITMENT_V2" + root + previous + sequence.to_bytes(8, "little") + token_id.to_bytes(4, "little") + policy + amount_commitment).digest()
    scope = hashlib.sha256(b"TSN_GPRU_TCAP_CREDIT_SCOPE_V2" + root + previous + successor + sequence.to_bytes(8, "little") + token_id.to_bytes(4, "little") + policy + nullifier).digest()
    expires = valid_after + 150
    auth = hashlib.sha256(b"TSN_GPRU_TCAP_CREDIT_V2" + bytes(tip) + valid_after.to_bytes(8, "little") + expires.to_bytes(8, "little") + previous + successor + sequence.to_bytes(8, "little") + token_id.to_bytes(4, "little") + policy + scope + nullifier).hexdigest()
    return {
        "tipRootCommitment": root.hex(), "previousCommitment": previous.hex(), "newCommitment": successor.hex(),
        "tip": str(tip), "initializeTip": initialize_tip,
        **({"initialCommitment": initial_commitment.hex()} if initialize_tip else {}),
        "amountCommitment": amount_commitment.hex(), "sequence": str(sequence), "tokenId": token_id,
        "policyCommitment": policy.hex(), "gpruScopeCommitment": scope.hex(), "nullifier": nullifier.hex(),
        "validAfterSlot": str(valid_after), "expiresAtSlot": str(expires), "authorizationDigest": auth,
        "amountBaseUnits": amount, "depositAmountBaseUnits": str(amount), "mint": str(request.tokenMintAddress),
        "depositAccounts": {"depositor": str(request.senderWallet), "config": accounts[1], "assetEntry": accounts[2], "reserveState": accounts[3], "source": accounts[4], "vault": accounts[5], "mint": accounts[6], "tokenProgram": accounts[7]},
    }


async def _verify_receiver_work(work: dict[str, Any]) -> dict[str, Any]:
    kind = str(work.get("kind") or "")
    payload = work.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("Receiver work payload must be an object")
    if kind == "AUTHORIZED_FUNDING":
        request = CreateIntentRequest(**payload)
        verified_fields = await _verify_payment_authorization_from_signed_message(request)
        if request.senderFundingMode != "tcap_deposit_v2":
            raise ValueError("Only the deployed TCAP V2 GPRU TIN credit path is supported")
        transition = await _construct_node_owned_tcap_transition(request, verified_fields)
        tip = _validate_tcap_credit_digest(transition)
        _verify_signed_tcap_deposit_contract(
            transaction_base64=str(request.senderSignedFundingTransaction), transition=transition,
            wallet=str(request.senderWallet or ""), tip_address=tip, initialize_tip=False,
        )
        simulation = await _simulate_owner_signed_tcap_deposit(str(request.senderSignedFundingTransaction))
        return {
            "verifiedPayload": {**request.model_dump(), **verified_fields, "tcapTip": tip, "tcapCreditTransition": transition},
            "verificationType": "TSN_TCAP_V2_GPRU_CREDIT_INTENT",
            "programSimulation": simulation,
        }
    if kind == "SETTLEMENT":
        funding_id = str(payload.get("intentId") or "").strip()
        if not funding_id:
            raise ValueError("Settlement is missing its funding intent reference")
        funding = await _receiver_work_by_id(funding_id)
        if funding.get("kind") != "AUTHORIZED_FUNDING" or funding.get("status") != "CONFIRMED":
            raise ValueError("Funding deposit is not confirmed")
        funding_payload = funding.get("payload") or {}
        if funding_payload.get("senderFundingMode") != "tcap_deposit_v2":
            raise ValueError("Settlement is not a TCAP one-time credit deposit")
        request = CreateIntentRequest(**funding_payload)
        # Reuse the already verified sender authorization without consuming its
        # one-time nonce a second time; the settlement references that receipt.
        message = str(request.senderAuthorizationMessage or "")
        action = "Cross-Chain Payment Intent" if message.startswith("TSN Cross-Chain Payment Intent\n") else "Payment Intent"
        signed_fields = _parse_canonical_message(message, action)
        tin = str(signed_fields.get("Recipient TIN") or "")
        if not re.fullmatch(r"\d{10}", tin):
            raise ValueError("Funding authorization does not contain a valid TIN")
        relation = await read_onchain_tin_tcap_relationship(tin)
        if not relation:
            raise ValueError("TIN has no active on-chain TCAP relationship")
        transition = await _construct_node_owned_tcap_transition(request, {
            "recipientTin": tin,
            "recipientRouteCommitment": str(relation["tcapRelationshipCommitment"]).lower(),
            "recipientRouteVersion": int(relation["tcapRouteVersion"]),
        })
        if not hmac.compare_digest(
            str(transition.get("tipRootCommitment") or "").lower(),
            str(relation.get("tcapRelationshipReference") or "").lower(),
        ):
            raise ValueError("Credit transition TIP root differs from the resolved TIN route reference")
        if not hmac.compare_digest(
            str(transition.get("policyCommitment") or "").lower(),
            str(relation.get("tcapPolicyCommitment") or "").lower(),
        ):
            raise ValueError("Credit transition policy differs from the resolved TIN route")
        tip = _validate_tcap_credit_digest(transition)
        tip_exists = await _assert_tcap_tip_predecessor(transition, tip, allow_missing=True)
        if not tip_exists and not transition.get("initializeTip"):
            raise ValueError("TCAP TIN TIP is missing and the verified transition has no initializer")
        token_decimals = int(get_supported_token_metadata().get(str(request.tokenMintAddress), {}).get("decimals", 6))
        amount_base_units = ui_amount_to_base_units(request.amount, token_decimals)
        if str(transition.get("mint") or "") != str(request.tokenMintAddress):
            raise ValueError("Credit transition mint differs from the confirmed wallet deposit")
        if int(transition.get("amountBaseUnits") or 0) != amount_base_units:
            raise ValueError("Credit transition amount differs from the confirmed wallet deposit")
        funding_evidence = await _verify_confirmed_tcap_deposit(
            funding_work=funding,
            transition=transition,
            wallet=str(request.senderWallet or ""),
            token_mint=str(request.tokenMintAddress),
        )
        await _assert_tcap_gpru_credit_program_preconditions(transition, tip)
        execution_transition = {
            "tipRootCommitment": str(transition["tipRootCommitment"]).lower(),
            "tip": tip,
            "initializeTip": bool(transition.get("initializeTip")),
            **({"initialCommitment": str(transition["initialCommitment"]).lower()} if transition.get("initializeTip") else {}),
            "previousCommitment": str(transition["previousCommitment"]).lower(),
            "newCommitment": str(transition["newCommitment"]).lower(),
            "sequence": str(transition["sequence"]),
            "tokenId": int(transition["tokenId"]),
            "amountBaseUnits": str(funding_evidence["amountBaseUnits"]),
            "mint": str(funding_evidence["mint"]),
            "policyCommitment": str(transition["policyCommitment"]).lower(),
            "gpruScopeCommitment": str(transition["gpruScopeCommitment"]).lower(),
            "nullifier": str(transition["nullifier"]).lower(),
            "validAfterSlot": str(transition["validAfterSlot"]),
            "expiresAtSlot": str(transition["expiresAtSlot"]),
            "authorizationDigest": str(transition["authorizationDigest"]).lower(),
            "assetEntry": str((transition.get("depositAccounts") or {}).get("assetEntry") or ""),
            "tcapConfig": str((transition.get("depositAccounts") or {}).get("config") or ""),
        }
        if not all(execution_transition[name] for name in ("assetEntry", "tcapConfig")):
            raise ValueError("TCAP asset entry or config is missing from the verified deposit")
        await _assert_tcap_gpru_credit_program_preconditions(transition, tip)
        return {
            "verifiedPayload": {
                "tcapCreditTransition": execution_transition,
                "fundingSignature": funding_evidence["signature"],
                "fundingSlot": funding_evidence["slot"],
                "amountBaseUnits": funding_evidence["amountBaseUnits"],
                "mint": funding_evidence["mint"],
            },
            "verificationType": "TSN_TCAP_V2_DEPOSIT_CONFIRMED_AND_GPRU_CREDIT_READY",
        }
    if kind == "TIN_OPERATION":
        normalized = _normalize_tin_operation_input(payload)
        await assert_tin_operation_can_enter(normalized)
        return {
            "verifiedPayload": normalized,
            "hasPublicRouteEnvelope": False,
            "verificationType": "TSN_TIN_OPERATION",
        }
    raise ValueError(f"Unsupported Receiver work kind: {kind}")


async def receiver_verification_worker() -> None:
    headers = {"x-api-key": TSN_RECEIVER_NODE_API_KEY, "content-type": "application/json"}
    if _receiver_wake_event is None:
        raise RuntimeError("TSN Receiver wake event is not initialized")
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            # Sleep without a timer or network request until the Receiver sends
            # an authenticated wake. This is the important CPU/quota boundary.
            logger.info("TSN Receiver verifier sleeping; waiting for wake")
            await _receiver_wake_event.wait()
            _receiver_wake_event.clear()
            logger.info("TSN Receiver verifier woke; draining authenticated work")
            retry_delay = 2.0
            consecutive_failures = 0
            while True:
                try:
                    leased_work = await receiver_request(client, "POST", "/api/internal/node/work", headers=headers, json={
                        "nodeId": TSN_NODE_ID,
                        "supportedKinds": ["AUTHORIZED_FUNDING", "TIN_OPERATION", "SETTLEMENT"],
                    })
                    leased_work.raise_for_status()
                    work = leased_work.json().get("work")
                    if not work:
                        # Queue drained. Return to the event wait; no polling.
                        logger.info("TSN Receiver verifier drained queue; sleeping")
                        break
                    lease_context = {
                        "source": "tsn-receiver",
                        "workId": str(work.get("id") or ""),
                        "kind": str(work.get("kind") or ""),
                        "stateVersion": work.get("stateVersion"),
                        "payloadCommitment": str(work.get("payloadCommitment") or ""),
                    }
                    if TSN_LOCAL_FLOW_LOGS:
                        logger.info(
                            "TSN Receiver lease acquired: work_id=%s kind=%s state_version=%s payload_commitment=%s",
                            lease_context["workId"], lease_context["kind"],
                            lease_context["stateVersion"], lease_context["payloadCommitment"],
                        )
                    try:
                        evidence = await _verify_receiver_work(work)
                        evidence = {**evidence, "receiverLease": lease_context}
                        status = "VERIFIED"
                    except Exception as exc:
                        logger.warning("Receiver work rejected: id=%s reason=%s", work.get("id"), str(exc))
                        evidence = {"reason": str(exc)[:500], "receiverLease": lease_context}
                        status = "REJECTED"
                    evidence["nodeAttestation"] = _sign_node_verification(
                        work=work,
                        status=status,
                        evidence=evidence,
                        verification_type=str(evidence.get("verificationType") or ""),
                    )
                    result = await receiver_request(client, "PATCH", "/api/internal/node/work", headers=headers, json={
                        "id": work["id"],
                        "owner": TSN_NODE_ID,
                        "expectedVersion": work["stateVersion"],
                        "status": status,
                        "evidence": evidence,
                    })
                    result.raise_for_status()
                    if TSN_LOCAL_FLOW_LOGS:
                        logger.info(
                            "TSN Receiver work transitioned: work_id=%s status=%s verified_payload_commitment=%s",
                            lease_context["workId"], status, lease_context["payloadCommitment"],
                        )
                    retry_delay = 2.0
                    consecutive_failures = 0
                except asyncio.CancelledError:
                    raise
                except Exception:
                    consecutive_failures += 1
                    logger.exception("TSN Receiver verification failed; retrying while awake")
                    if consecutive_failures >= 6:
                        logger.error(
                            "TSN Receiver verifier returning to sleep after %d consecutive failures",
                            consecutive_failures,
                        )
                        break
                    await asyncio.sleep(retry_delay)
                    retry_delay = min(30.0, retry_delay * 2)

async def _receiver_work_by_id(work_id: str) -> dict[str, Any]:
    if not TSN_RECEIVER_URL or not TSN_RECEIVER_NODE_API_KEY:
        raise HTTPException(503, "TSN Receiver service is not configured")
    async with httpx.AsyncClient(timeout=20) as client:
        response = await receiver_request(
            client,
            "GET",
            "/api/internal/node/work",
            params={"id": work_id},
            headers={"x-api-key": TSN_RECEIVER_NODE_API_KEY},
        )
    if response.status_code == 404:
        raise HTTPException(404, "Receiver work was not found")
    if response.status_code != 200:
        raise HTTPException(503, "TSN Receiver work lookup failed")
    work = response.json().get("work")
    if not isinstance(work, dict):
        raise HTTPException(422, "Receiver returned malformed work")
    return work


def _receiver_verified_payload(work: dict[str, Any]) -> dict[str, Any] | None:
    verification = work.get("verification") or {}
    verified = verification.get("verifiedPayload")
    if isinstance(verified, dict):
        return dict(verified)
    delta = verification.get("payloadDelta")
    if not isinstance(delta, dict):
        return None
    payload = dict(work.get("payload") or {})
    for key in delta.get("removedFields") or []:
        payload.pop(str(key), None)
    payload.update(delta.get("addedFields") or {})
    for key, value in (delta.get("changedFields") or {}).items():
        if isinstance(value, dict) and "nodeVerified" in value:
            payload[key] = value["nodeVerified"]
        else:
            payload[key] = value
    return payload

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialise the configured mempool store.
    await get_store()
    if not TSN_RECEIVER_NODE_API_KEY and not MEMPOOL_API_KEY:
        raise RuntimeError("TSN Node service credential is not configured")
    if TSN_RECEIVER_URL and TSN_RECEIVER_NODE_API_KEY:
        try:
            _node_verification_signing_key()
        except RuntimeError as exc:
            raise RuntimeError(
                "TSN Node verification signing key is required when the Receiver worker is enabled"
            ) from exc
    if not TSN_SETTLEMENT_AUTHORIZATION_SIGNING_KEY:
        logger.warning("TSN settlement authorization signing is disabled until its signing key is configured")
    if not TSN_THRESHOLD_NONCE_SIGNING_KEY:
        logger.warning(
            "TIN threshold key access is disabled until TSN_THRESHOLD_NONCE_SIGNING_KEY is configured"
        )
    if is_epoch_due(await read_epoch_state()):
        logger.info("Epoch was overdue on startup; closing before accepting work")
        try:
            result = await close_epoch_task()
            logger.info("Startup epoch close completed: %s", result.message)
        except Exception:
            logger.exception("Startup epoch close failed; live work remains available")
    global _receiver_wake_event
    _receiver_wake_event = asyncio.Event()
    # Process work that arrived while the Node was offline, then sleep again.
    _receiver_wake_event.set()
    # Do not keep a periodic scheduler alive on the hosted Node. Epoch rollover
    # is checked at startup and on authenticated Receiver wake-ups, so an idle
    # deployment consumes no timer/polling CPU.
    tasks: list[asyncio.Task[Any]] = []
    if TSN_RECEIVER_URL and TSN_RECEIVER_NODE_API_KEY:
        tasks.append(asyncio.create_task(receiver_verification_worker()))
    logger.info("TSN Node started on port %d (epoch every %dh)", PORT, EPOCH_HOURS)
    yield
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    if _store:
        await _store.aclose()

# â”€â”€ FastAPI app â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app = FastAPI(
    title="TSN Mempool",
    description=(
        "Shared off-chain settlement queue for the Transfer Settlement Network. "
        f"Epoch every {EPOCH_HOURS}h â€” archives to GitHub (bigdreamsweb3/tsn-epoch-records)."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

@app.post("/internal/wake", dependencies=[Depends(require_worker_api_key)])
async def wake_receiver_verification() -> dict[str, Any]:
    """Wake the verifier after Receiver commit; carries no work payload."""
    if _receiver_wake_event is None:
        raise HTTPException(503, "TSN Node verifier is not ready")
    if is_epoch_due(await read_epoch_state()):
        try:
            result = await close_epoch_task()
            logger.info("Wake-triggered epoch close completed: %s", result.message)
        except Exception:
            logger.exception("Wake-triggered epoch close failed; work remains available")
    _receiver_wake_event.set()
    logger.info("TSN Receiver wake accepted")
    return {"ok": True, "status": "awake"}

@app.post("/internal/settlement-authorizations/settlement", dependencies=[Depends(require_worker_api_key)])
async def create_settlement_authorization(body: dict[str, Any]) -> dict[str, Any]:
    """Create a one-time DNA authorization without exposing sender escrow data."""
    settlement_id = str(body.get("workId") or "").strip()
    operator_text = str(body.get("crankerPubkey") or "").strip()
    if not settlement_id or not operator_text:
        raise HTTPException(422, "workId and crankerPubkey are required")
    settlement_work = await _receiver_work_by_id(settlement_id)
    if settlement_work.get("kind") != "SETTLEMENT" or settlement_work.get("status") != "CRANKER_LEASED":
        raise HTTPException(409, "Settlement is not leased")
    if (settlement_work.get("crankerLease") or {}).get("owner") != operator_text:
        raise HTTPException(403, "Settlement lease belongs to another Cranker")
    settlement_lease = settlement_work.get("crankerLease") or {}
    lease_expires_at = parse_iso(str(settlement_lease.get("expiresAt") or ""))
    now = datetime.now(timezone.utc)
    if lease_expires_at <= now:
        raise HTTPException(409, "Settlement lease has expired")
    lease_version = int(settlement_lease.get("version") or settlement_work.get("stateVersion") or 0)
    if lease_version <= 0:
        raise HTTPException(422, "Settlement lease version is missing")
    settlement_payload = settlement_work.get("payload") or {}
    settlement_verified = _receiver_verified_payload(settlement_work) or {}
    intent_id = str(settlement_payload.get("intentId") or "").strip()
    if not intent_id:
        raise HTTPException(422, "Settlement does not reference a payment intent")
    intent_work = await _receiver_work_by_id(intent_id)
    if intent_work.get("kind") != "AUTHORIZED_FUNDING" or intent_work.get("status") != "CONFIRMED":
        raise HTTPException(409, "Payment intent is not confirmed for payout")
    funding_private = intent_work.get("payload") or {}
    if funding_private.get("senderFundingMode") == "tcap_deposit_v2":
        transition = settlement_verified.get("tcapCreditTransition")
        if not isinstance(transition, dict):
            raise HTTPException(422, "Verified settlement is missing the TCAP V2 transition")
        verified_amount = settlement_verified.get("amountBaseUnits")
        transition_amount = transition.get("amountBaseUnits") or verified_amount
        try:
            amount_base_units = int(str(transition_amount or "0"))
        except (TypeError, ValueError):
            raise HTTPException(422, "Verified settlement has an invalid TCAP credit amount")
        if amount_base_units <= 0:
            raise HTTPException(422, "Verified settlement is missing the TCAP credit amount")
        if verified_amount is not None:
            try:
                confirmed_amount_base_units = int(str(verified_amount))
            except (TypeError, ValueError):
                raise HTTPException(422, "Confirmed TCAP deposit evidence has an invalid amount")
            if confirmed_amount_base_units != amount_base_units:
                raise HTTPException(409, "Verified TCAP transition amount differs from confirmed deposit evidence")
        verified_mint = str(
            settlement_verified.get("mint")
            or funding_private.get("tokenMintAddress")
            or ""
        ).strip()
        transition_mint = str(transition.get("mint") or verified_mint).strip()
        if not verified_mint or not transition_mint:
            raise HTTPException(422, "Verified settlement is missing the confirmed TCAP deposit mint")
        if transition_mint != verified_mint:
            raise HTTPException(409, "Verified TCAP transition mint differs from confirmed deposit evidence")
        required_transition_fields = (
            "tipRootCommitment", "tip", "previousCommitment", "newCommitment", "sequence", "tokenId",
            "policyCommitment", "gpruScopeCommitment", "nullifier", "validAfterSlot", "expiresAtSlot",
            "authorizationDigest",
        )
        missing_transition_fields = [name for name in required_transition_fields if transition.get(name) is None]
        if transition.get("initializeTip") and not transition.get("initialCommitment"):
            missing_transition_fields.append("initialCommitment")
        if missing_transition_fields:
            raise HTTPException(422, f"Verified TCAP transition is missing fields: {', '.join(missing_transition_fields)}")
        transition_with_amount = {**transition, "amountBaseUnits": str(amount_base_units)}
        deposit_accounts = transition.get("depositAccounts")
        if not isinstance(deposit_accounts, dict):
            deposit_accounts = {}
        asset_entry = str(transition.get("assetEntry") or deposit_accounts.get("assetEntry") or "").strip()
        tcap_config = str(transition.get("tcapConfig") or deposit_accounts.get("config") or "").strip()
        execution_transition = {
            "tipRootCommitment": str(transition["tipRootCommitment"]).lower(),
            "tip": str(transition["tip"]),
            "initializeTip": bool(transition.get("initializeTip")),
            **({"initialCommitment": str(transition["initialCommitment"]).lower()} if transition.get("initializeTip") else {}),
            "previousCommitment": str(transition["previousCommitment"]).lower(),
            "newCommitment": str(transition["newCommitment"]).lower(),
            "sequence": str(transition["sequence"]),
            "tokenId": int(transition["tokenId"]),
            "amount": str(amount_base_units),
            "amountBaseUnits": str(amount_base_units),
            "mint": verified_mint,
            "policyCommitment": str(transition["policyCommitment"]).lower(),
            "gpruScopeCommitment": str(transition["gpruScopeCommitment"]).lower(),
            "nullifier": str(transition["nullifier"]).lower(),
            "validAfterSlot": str(transition["validAfterSlot"]),
            "expiresAtSlot": str(transition["expiresAtSlot"]),
            "authorizationDigest": str(transition["authorizationDigest"]).lower(),
            "assetEntry": asset_entry,
            "tcapConfig": tcap_config,
        }
        if not all(execution_transition[name] for name in ("assetEntry", "tcapConfig")):
            raise HTTPException(422, "Verified TCAP deposit is missing its asset entry or config account")
        tip = _validate_tcap_credit_digest(transition_with_amount)
        _validate_tcap_credit_digest(execution_transition)
        lease_expires_at = parse_iso(str(settlement_lease.get("expiresAt") or ""))
        expires_at_ts = min(int(time.time()) + PERMIT_TTL_SECS, int(lease_expires_at.timestamp()))
        if expires_at_ts <= int(time.time()):
            raise HTTPException(409, "Settlement lease expires before the TCAP credit can be submitted")
        return {
            "kind": "TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V2",
            "authorizationVersion": 2,
            "leaseId": str(settlement_lease.get("leaseId") or settlement_id),
            "leaseVersion": lease_version,
            "leaseExpiresAt": str(settlement_lease.get("expiresAt")),
            "expiresAtTs": expires_at_ts,
            "transition": execution_transition,
        }
    raise HTTPException(409, "Legacy PRU payout settlement is retired; only verified TCAP V2 TIN credits are accepted")


@app.post("/internal/settlement-authorizations/signature", dependencies=[Depends(require_worker_api_key)])
async def sign_settlement_transaction(body: dict[str, Any]) -> dict[str, Any]:
    """Mother Node co-signs only the exact transaction for a leased settlement."""
    settlement_id = str(body.get("workId") or "").strip()
    operator = str(body.get("crankerPubkey") or "").strip()
    encoded_message = str(body.get("messageBase64") or "").strip()
    if not settlement_id or not operator or not encoded_message:
        raise HTTPException(422, "workId, crankerPubkey, and messageBase64 are required")
    if len(encoded_message) > 16_384:
        raise HTTPException(413, "Settlement transaction message is too large")
    try:
        message = base64.b64decode(encoded_message, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(422, "Settlement transaction message is invalid base64") from exc
    if not message or base64.b64encode(message).decode("ascii") != encoded_message:
        raise HTTPException(422, "Settlement transaction message encoding is not canonical")

    authorization = await create_settlement_authorization({"workId": settlement_id, "crankerPubkey": operator})
    transition = authorization.get("transition")
    if not isinstance(transition, dict):
        raise HTTPException(422, "Node settlement authorization has no verified TCAP transition")
    signing_key = _mother_authority_signing_key()
    authority = await _assert_mother_authority_key_matches_chain(signing_key)
    recent_blockhash = _verify_mother_signed_tcap_settlement_message(
        message, operator=operator, authority=authority, transition=transition,
    )
    blockhash_status = await solana_rpc("isBlockhashValid", [
        encode_base58(recent_blockhash), {"commitment": "confirmed"},
    ])
    if not bool(((blockhash_status.get("result") or {}).get("value"))):
        raise HTTPException(409, "Cranker transaction blockhash is no longer valid; rebuild and request a fresh Mother signature")
    signature = signing_key.sign(message).signature
    return {"authority": authority, "signatureBase64": base64.b64encode(signature).decode("ascii")}

# Allow frontend to call this API from any origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.environ.get(
            "TSN_NODE_ALLOWED_ORIGINS",
            "http://127.0.0.1:8010,http://localhost:8010",
        ).split(",")
        if origin.strip()
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# â”€â”€ Root â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.post("/", response_model=MempoolStatusResponse)
async def mempool_status(request: MempoolStatusRequest) -> MempoolStatusResponse:
    """Mempool health check and current epoch info."""
    return MempoolStatusResponse(
        status="ok",
        epoch=await build_epoch_status(),
    )


@app.post("/threshold-access/nonces/consume")
async def consume_threshold_access_nonce(request: dict[str, Any]) -> dict[str, Any]:
    """Verify wallet + device authorization and atomically consume its nonce.

    This endpoint receives public proofs only. Its signing key attests nonce
    consumption and cannot decrypt TIN data, derive a PRU, or authorize funds.
    """
    if not TSN_THRESHOLD_NONCE_SIGNING_KEY:
        raise HTTPException(503, "TIN threshold nonce verifier is not configured")
    try:
        verified = verify_threshold_access_request(request)
        signing_key = SigningKey(
            decode_secret_key(
                TSN_THRESHOLD_NONCE_SIGNING_KEY,
                {32, 64},
                "TSN_THRESHOLD_NONCE_SIGNING_KEY",
            )[:32]
        )
    except ThresholdAccessError as exc:
        raise HTTPException(403, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(503, "TIN threshold nonce verifier is unavailable") from exc

    consumed_at = datetime.now(timezone.utc)
    receipt = create_signed_nonce_receipt(
        verified,
        consumed_at=consumed_at,
        signing_key=signing_key,
    )
    storage_key = nonce_storage_key(verified)
    store = await get_mempool_store()
    request_commitment = threshold_request_commitment(request)
    stored_record = {
        "requestCommitment": request_commitment,
        "receipt": receipt,
    }
    consumed = await store.consume_once(
        k_threshold_access_nonces(),
        storage_key,
        json.dumps(stored_record, separators=(",", ":")),
    )
    if not consumed:
        existing_raw = await store.hget(k_threshold_access_nonces(), storage_key)
        try:
            existing = json.loads(existing_raw or "null")
        except json.JSONDecodeError as exc:
            raise HTTPException(409, "authorized-device proof nonce has conflicting state") from exc
        if (
            not isinstance(existing, dict)
            or existing.get("requestCommitment") != request_commitment
            or not isinstance(existing.get("receipt"), dict)
        ):
            raise HTTPException(409, "authorized-device proof nonce has already been used")
        return existing["receipt"]
    return receipt

# â”€â”€ Intents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.post("/intents", response_model=PublicMempoolIntent)
async def post_intent(req: CreateIntentRequest) -> PublicMempoolIntent:
    """Persist a payment intent at Receiver ingress for asynchronous Node verification."""
    if not TSN_RECEIVER_URL or not TSN_RECEIVER_NODE_API_KEY:
        raise HTTPException(503, "TSN Receiver is required for payment-intent processing")

    headers = {"x-api-key": TSN_RECEIVER_NODE_API_KEY, "content-type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await receiver_request(
                client,
                "POST",
                "/intents",
                headers=headers,
                json=req.model_dump(exclude_none=True),
            )
    except (httpx.RequestError, RuntimeError) as exc:
        raise HTTPException(503, "TSN Receiver could not accept the payment intent") from exc
    if response.status_code >= 400:
        detail = "TSN Receiver rejected the payment intent"
        try:
            detail = str(response.json().get("error") or detail)
        except (ValueError, AttributeError):
            pass
        raise HTTPException(response.status_code, detail)
    received = response.json()
    now = str(received.get("postedAt") or datetime.now(timezone.utc).isoformat())
    logger.info("Payment intent accepted by Receiver: work_id=%s", received.get("id"))
    return PublicMempoolIntent(
        id=str(received.get("id") or req.paymentId),
        paymentId=req.paymentId,
        intentSeedHash=req.intentSeedHash,
        recipientHash=req.recipientHash,
        tokenMintAddress=req.tokenMintAddress,
        amount=req.amount,
        recipientAmount=req.recipientAmount,
        source=req.source,
        status=str(received.get("status") or "pending"),
        postedAt=now,
        updatedAt=str(received.get("updatedAt") or now),
    )


@app.get("/network/recent-blockhash")
async def get_network_recent_blockhash() -> dict[str, Any]:
    """Return a sender-signable blockhash from the RPC this Node uses for verification."""
    response = await solana_rpc("getLatestBlockhash", [{"commitment": "confirmed"}])
    result = response.get("result") or {}
    value = result.get("value") or {}
    blockhash = str(value.get("blockhash") or "")
    last_valid_block_height = value.get("lastValidBlockHeight")
    if not blockhash or not isinstance(last_valid_block_height, int):
        raise HTTPException(503, "Solana RPC returned an invalid recent blockhash")
    return {
        "recentBlockhash": blockhash,
        "lastValidBlockHeight": last_valid_block_height,
        "contextSlot": (result.get("context") or {}).get("slot"),
    }


@app.get("/tin-resolution/{tin}")
async def get_tin_resolution(tin: str = ApiPath(..., min_length=10, max_length=10)) -> dict[str, Any]:
    if not re.fullmatch(r"\d{10}", tin):
        raise HTTPException(422, "TIN must contain exactly 10 digits")
    identity = await resolve_tin_display_identity(tin)
    if identity is None:
        raise HTTPException(404, "TIN could not be resolved")
    display_name = str(identity.get("displayName") or "").strip()
    return {
        "tin": tin,
        **identity,
        "displayNameSource": "owner-provided" if display_name else "not provided",
    }

@app.get(
    "/intents",
    response_model=list[PublicMempoolIntent],
    dependencies=[Depends(require_worker_api_key)],
)
async def list_intents(status: Optional[str] = Query(None)) -> list[PublicMempoolIntent]:
    items = [MempoolIntent(**i) for i in await hget_all_json(k_intents())]
    if status:
        items = [i for i in items if i.status == status]
    return [public_intent(item) for item in sorted(items, key=lambda i: i.postedAt)]

@app.patch(
    "/intents/{intent_id}/status",
    response_model=MempoolIntent,
    dependencies=[Depends(require_worker_api_key)],
)
async def update_intent_status(
    intent_id: str = ApiPath(...),
    body: UpdateStatusRequest = ...,
) -> MempoolIntent:
    r = await get_mempool_store()
    raw = await r.hget(k_intents(), intent_id)
    if not raw:
        raise HTTPException(404, f"Intent {intent_id} not found")
    data = json.loads(raw)
    data.update({"status": body.status, "updatedAt": datetime.now(timezone.utc).isoformat()})
    if body.assignedCrankerPubkey is not None:
        data["assignedCrankerPubkey"] = body.assignedCrankerPubkey
    if body.fundingTxSig is not None:
        data["fundingTxSig"] = body.fundingTxSig
    if body.settlementTxSig is not None:
        data["settlementTxSig"] = body.settlementTxSig
    if body.settlementResolution is not None:
        data["settlementResolution"] = body.settlementResolution
    if body.settlementReason is not None:
        data["settlementReason"] = body.settlementReason
    await r.hset(k_intents(), intent_id, json.dumps(data))
    return MempoolIntent(**data)

# â”€â”€ Work queue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.get(
    "/intent-work",
    response_model=list[IntentWorkItem],
    dependencies=[Depends(require_worker_api_key)],
)
async def list_pending_intent_work(
    limit: int = Query(50, ge=1, le=500)
) -> list[IntentWorkItem]:
    """Pending payment-intent submissions for crankers to create on chain."""
    intents = sorted(
        [
            MempoolIntent(**intent)
            for intent in await hget_all_json(k_intents())
            if intent.get("status") == "pending"
        ],
        key=lambda intent: intent.postedAt,
    )[:limit]
    return [IntentWorkItem(intent=intent) for intent in intents]

# â”€â”€ Epoch management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.get("/metrics", response_model=MetricsResponse)
async def get_metrics() -> MetricsResponse:
    intents = await hget_all_json(k_intents())
    samples: list[float] = []
    latest: Optional[str] = None
    uptime_seconds = int((datetime.now(timezone.utc) - SERVICE_STARTED_AT).total_seconds())
    crankers = {intent.get("assignedCrankerPubkey") for intent in intents if intent.get("assignedCrankerPubkey")}
    return MetricsResponse(
        intent_to_settlement=IntentToSettlementMetrics(
            sample_count=len(samples),
            average_ms=sum(samples) / len(samples) if samples else 0,
            min_ms=min(samples) if samples else 0,
            max_ms=max(samples) if samples else 0,
            last_ms=samples[-1] if samples else 0,
            updated_at=latest,
        ),
        uptime=UptimeMetrics(
            service_started_at=SERVICE_STARTED_AT.isoformat(),
            uptime_seconds=uptime_seconds,
            uptime_days=uptime_seconds / 86400,
        ),
        active_crankers_last_epoch=len(crankers),
    )

@app.post(
    "/crankers/heartbeat",
    response_model=CrankerHeartbeatRecord,
    dependencies=[Depends(require_worker_api_key)],
)
async def post_cranker_heartbeat(req: CrankerHeartbeatRequest) -> CrankerHeartbeatRecord:
    r = await get_mempool_store()
    now_iso = datetime.now(timezone.utc).isoformat()
    existing_raw = await r.hget(k_crankers(), req.operator_pubkey)
    first_seen = now_iso
    if existing_raw:
        try:
            first_seen = json.loads(existing_raw).get("first_seen_at") or now_iso
        except json.JSONDecodeError:
            pass
    record = CrankerHeartbeatRecord(
        **req.model_dump(),
        first_seen_at=first_seen,
        last_seen_at=now_iso,
        online=True,
    )
    await r.hset(k_crankers(), req.operator_pubkey, json.dumps(record.model_dump()))
    return record

@app.get("/settlement-networks")
async def get_settlement_networks() -> list[dict[str, Any]]:
    """Return only destination routes ready for Creditcoin settlement.

    A chain ID or static configuration alone never makes a network active. The
    endpoint performs the same live route and liquidity checks used at intent
    admission; the exact requested amount is checked again for each intent.
    """
    try:
        return await ready_destination_networks(int(datetime.now(timezone.utc).timestamp()))
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(503, f"settlement network registry is invalid: {exc}") from exc


@app.get("/network/overview", response_model=NetworkOverviewResponse)
async def get_network_overview() -> NetworkOverviewResponse:
    supported_mints = get_supported_token_mints()
    intents = [
        intent for intent in await hget_all_json(k_intents())
        if intent.get("tokenMintAddress") in supported_mints
    ]
    heartbeat_records = await hget_all_json(k_crankers())
    now = datetime.now(timezone.utc)
    online_crankers = set()
    for record in heartbeat_records:
        operator_pubkey = record.get("operator_pubkey")
        last_seen_at = record.get("last_seen_at")
        if not operator_pubkey or not last_seen_at:
            continue
        try:
            if (now - parse_iso(str(last_seen_at))).total_seconds() <= CRANKER_HEARTBEAT_TTL_SECS:
                online_crankers.add(operator_pubkey)
        except ValueError:
            logger.warning("Ignoring cranker heartbeat with invalid last_seen_at=%s", last_seen_at)
    total_seen = {
        record.get("operator_pubkey")
        for record in heartbeat_records
        if record.get("operator_pubkey")
    }.union({intent.get("assignedCrankerPubkey") for intent in intents if intent.get("assignedCrankerPubkey")})

    by_mint: dict[str, dict[str, float]] = {}
    for intent in intents:
        mint = intent.get("tokenMintAddress")
        if not mint:
            continue
        bucket = by_mint.setdefault(mint, {"total": 0.0, "pending": 0.0, "executed": 0.0})
        amount = float(intent.get("amount") or 0)
        status = str(intent.get("status", "pending"))
        bucket["total"] += amount
        if status in ("executed", "settled", "completed"):
            bucket["executed"] += amount
        elif status == "pending":
            bucket["pending"] += amount

    vaults = await read_public_vault_liquidity_cached()
    token_rows: dict[str, TokenNetworkStatus] = {}
    for vault in vaults:
        mint = vault["token_mint"]
        amounts = by_mint.get(mint, {"total": 0.0, "pending": 0.0, "executed": 0.0})
        liquidity_units = float(vault.get("total_liquidity") or 0)
        liquidity_usd = float(vault.get("total_liquidity_usd") or 0)
        token_rows[mint] = TokenNetworkStatus(
            token_mint=mint,
            token_symbol=vault.get("token_symbol"),
            token_name=vault.get("token_name"),
            unit_price_usd=vault.get("unit_price_usd"),
            vault_token_account=vault.get("vault_token_account"),
            cranker_vault=vault.get("cranker_vault"),
            total_vault_liquidity_units=liquidity_units,
            total_vault_liquidity_usd=liquidity_usd,
            total_vault_liquidity=liquidity_usd,
            total_intent_amount=amounts["total"],
            pending_intent_amount=amounts["pending"],
            executed_intent_amount=amounts["executed"],
            vault_liquidity_estimate=liquidity_usd,
            liquidity_source="program_scan_epoch_cache",
        )

    for mint, amounts in by_mint.items():
        if mint in token_rows:
            continue
        token_rows[mint] = TokenNetworkStatus(
            token_mint=mint,
            total_vault_liquidity=0,
            total_vault_liquidity_units=0,
            total_vault_liquidity_usd=0,
            total_intent_amount=amounts["total"],
            pending_intent_amount=amounts["pending"],
            executed_intent_amount=amounts["executed"],
            vault_liquidity_estimate=0,
            liquidity_source="mempool_intents",
        )

    tokens = sorted(token_rows.values(), key=lambda token: token.total_vault_liquidity_usd, reverse=True)
    return NetworkOverviewResponse(
        online_crankers_last_epoch=len(online_crankers),
        total_crankers_seen=len(total_seen),
        total_vault_liquidity_usd=sum(token.total_vault_liquidity_usd for token in tokens),
        total_vault_liquidity=sum(token.total_vault_liquidity_usd for token in tokens),
        tokens=tokens,
    )

@app.get("/epoch/status", response_model=EpochStatus)
async def get_epoch_status() -> EpochStatus:
    return await build_epoch_status()

@app.post(
    "/epoch/close",
    response_model=EpochCloseResult,
    dependencies=[Depends(require_worker_api_key)],
)
async def close_epoch() -> EpochCloseResult:
    """Manually close the current epoch, archive it, and roll unresolved work forward."""
    logger.info("Manual epoch close triggered")
    return await close_epoch_task()

# â”€â”€ Entry point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if __name__ == "__main__":
    uvicorn.run("server:app", host=HOST, port=PORT, reload=False)
