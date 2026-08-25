from __future__ import annotations

"""
TSN Shared Mempool â€” self-hosted version.

Requirements:
    npm run tsn:mempool:install

    Or directly:
    python -m pip install -r tsn-protocol/tsn-node/requirements.txt

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
from pydantic import BaseModel, Field
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

load_dotenv(Path(__file__).resolve().parent / ".env")


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
TSN_NODE_ID = clean_env(os.environ.get("TSN_NODE_ID", "tsn-node-local"))
# The Receiver wakes this event after durable work is committed. The Node does
# not poll while the event is clear; it only drains the authenticated queue
# after a wake notification (or once at startup for already queued work).
_receiver_wake_event: asyncio.Event | None = None
ALLOW_DIRECT_FIREBASE_STORE = os.environ.get("TSN_ALLOW_DIRECT_FIREBASE_STORE", "").strip().lower() == "true"
MEMPOOL_FILE    = Path(os.environ.get("MEMPOOL_FILE", ".mempool-store.json")).resolve()
FIREBASE_COLLECTION = os.environ.get("FIREBASE_COLLECTION", "tsn_mempool").strip()
TSN_PROGRAM_ID  = os.environ.get("TSN_PROGRAM_ID") or os.environ.get("PROGRAM_ID") or "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V"
TINS_PROGRAM_ID = os.environ.get("TINS_PROGRAM_ID", "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT")
TINS_PROGRAM_SALT = b"TINS_SALT_2026"
MEMPOOL_API_KEY  = os.environ.get("MEMPOOL_API_KEY", "").strip()
TSN_ROUTE_DECRYPTION_PRIVATE_KEY = os.environ.get(
    "TSN_ROUTE_DECRYPTION_PRIVATE_KEY",
    "",
).strip()
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
_tin_operation_lock = asyncio.Lock()
_tin_fee_config_cache: Optional[dict[str, Any]] = None
_tin_fee_config_cache_expires_at = 0.0


TSN_RPC_GATEWAY_URL = clean_env(
    os.environ.get("TSN_RPC_GATEWAY_URL"),
    "https://tsn-rpc-gateway.vercel.app",
).rstrip("/")
# All Node on-chain reads, including replay and settlement authorization
# checks, use the single configured TrustLink RPC gateway.
TSN_SOLANA_RPC_URL = TSN_RPC_GATEWAY_URL


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

def ui_amount_to_base_units(value: Any, decimals: int) -> int:
    try:
        amount = Decimal(str(value))
        scaled = amount * (Decimal(10) ** decimals)
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise HTTPException(422, "Intent amount is invalid") from exc
    if amount <= 0 or scaled != scaled.to_integral_value():
        raise HTTPException(422, "Intent amount has invalid token precision")
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
def k_tin_operations() -> str: return f"{MEMPOOL_NS}:tin_operations"
def k_tin_fees() -> str: return f"{MEMPOOL_NS}:tin_operation_fees"
def k_tin_registry_shadow() -> str: return f"{MEMPOOL_NS}:tin_registry_shadow"
def k_tin_pru_routes() -> str: return f"{MEMPOOL_NS}:tin_pru_routes"
def k_tin_pru_route_sessions() -> str: return f"{MEMPOOL_NS}:tin_pru_route_sessions"
def k_tin_pru_route_nonces() -> str: return f"{MEMPOOL_NS}:tin_pru_route_nonces"
def k_tin_operation_nonces() -> str: return f"{MEMPOOL_NS}:tin_operation_nonces"
def k_canonical_message_nonces() -> str: return f"{MEMPOOL_NS}:canonical_message_nonces"
def k_threshold_access_nonces() -> str: return f"{MEMPOOL_NS}:threshold_access_nonces"
def k_tin_read_delegations() -> str: return f"{MEMPOOL_NS}:tin_read_delegations"
def k_platform_read_keys() -> str: return f"{MEMPOOL_NS}:platform_read_keys"
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
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(TSN_SOLANA_RPC_URL, json=payload)
        response.raise_for_status()
        rpc_response = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Solana RPC unavailable for %s: %s", method, exc)
        raise HTTPException(503, "Solana RPC is unavailable while verifying TINS state") from exc
    if rpc_response.get("error"):
        message = rpc_response["error"].get("message", "unknown error")
        logger.warning("Solana RPC error for %s: %s", method, rpc_response["error"])
        raise HTTPException(503, f"Solana RPC rejected TINS lookup: {message}")
    return rpc_response

def get_tins_program_pubkey() -> Pubkey:
    return Pubkey.from_string(TINS_PROGRAM_ID)

def get_tins_identity_pda(owner_pubkey: str) -> Pubkey:
    owner_bytes = decode_base58(owner_pubkey)
    identity_seed = hashlib.sha256(owner_bytes + TINS_PROGRAM_SALT).digest()
    return Pubkey.find_program_address([b"identity", identity_seed], get_tins_program_pubkey())[0]

def decode_tin_account_header(data: bytes) -> dict[str, Any]:
    if len(data) < 8 + 4:
        raise ValueError("TINS account data is too short")
    offset = 0
    tin = int.from_bytes(data[offset:offset + 8], "little")
    offset += 8
    display_name_len = int.from_bytes(data[offset:offset + 4], "little")
    offset += 4
    if display_name_len < 0 or offset + display_name_len + 32 > len(data):
        raise ValueError("TINS account display name is invalid")
    display_name = data[offset:offset + display_name_len].decode("utf-8", errors="replace")
    offset += display_name_len
    owner_pubkey_hash = data[offset:offset + 32]
    return {
        "tin": str(tin),
        "displayName": display_name,
        "ownerPubkeyHash": owner_pubkey_hash.hex(),
    }


def decode_tin_account_route_material(data: bytes) -> dict[str, Any]:
    """Decode the current route fields from either a legacy TIP account wrapper.

    The account layout is still the TIP ``TinAccount`` layout, but the payload
    contains the current TSN device-seed and public-route envelopes.  This
    function never decrypts the master-seed envelope; it only extracts the
    node-readable public-route envelope and its binding fields.
    """
    buffer = bytes(data)
    offset = 0

    def take(length: int, label: str) -> bytes:
        nonlocal offset
        if length < 0 or offset + length > len(buffer):
            raise ValueError(f"TINS account {label} is truncated")
        value = buffer[offset:offset + length]
        offset += length
        return value

    tin = int.from_bytes(take(8, "TIN"), "little")
    display_name_length = int.from_bytes(take(4, "display name length"), "little")
    take(display_name_length, "display name")
    owner_pubkey_hash = take(32, "owner hash")

    master_seed_length = int.from_bytes(take(4, "master-seed length"), "little")
    take(master_seed_length, "master-seed envelope")
    take(8, "created-at")
    take(32, "encrypted metadata hash")
    pru_configuration_hash = take(32, "PRU configuration hash")

    route_length = int.from_bytes(take(4, "route-envelope length"), "little")
    route_envelope = take(route_length, "public-route envelope")
    route_version = int.from_bytes(take(8, "route version"), "little")
    route_nonce = take(32, "route nonce")
    # Older finalized TINs predate the TCap relationship suffix. Keep their
    # parser isolated for migration reads; they are never treated as TCap.
    if offset == len(buffer):
        if route_length == 0 or route_version < 1:
            raise ValueError("TINS account does not contain an active public route envelope")
        return {
            "tin": str(tin),
            "ownerPubkeyHash": owner_pubkey_hash.hex(),
            "pruConfigurationHash": pru_configuration_hash.hex(),
            "encryptedPublicRouteEnvelope": base64.b64encode(route_envelope).decode("ascii"),
            "routeVersion": route_version,
            "routeNonce": route_nonce.hex(),
            "tcapRouteVersion": 0,
            "tcapRelationshipCommitment": (bytes(32)).hex(),
            "tcapRelationshipReference": (bytes(32)).hex(),
            "tcapPolicyCommitment": (bytes(32)).hex(),
        }

    # Current TCap-backed TINs intentionally carry an empty legacy route
    # envelope. Their public binding is the relationship/policy commitments;
    # no PRU inventory is present or recoverable by infrastructure.
    tcap_route_version = int.from_bytes(take(1, "TCap route version"), "little")
    tcap_relationship_commitment = take(32, "TCap relationship commitment")
    tcap_relationship_reference = take(32, "TCap relationship reference")
    tcap_policy_commitment = take(32, "TCap policy commitment")
    if tcap_route_version == 1:
        if route_length != 0 or pru_configuration_hash != bytes(32):
            raise ValueError("TCap TIN contains legacy PRU route material")
        if any(value == bytes(32) for value in (tcap_relationship_commitment, tcap_relationship_reference, tcap_policy_commitment)):
            raise ValueError("TCap TIN relationship commitments are incomplete")
    elif route_length == 0 or route_version < 1:
        raise ValueError("TINS account does not contain an active public route envelope")

    return {
        "tin": str(tin),
        "ownerPubkeyHash": owner_pubkey_hash.hex(),
        "pruConfigurationHash": pru_configuration_hash.hex(),
        "encryptedPublicRouteEnvelope": base64.b64encode(route_envelope).decode("ascii"),
        "routeVersion": route_version,
        "routeNonce": route_nonce.hex(),
        "tcapRouteVersion": tcap_route_version,
        "tcapRelationshipCommitment": tcap_relationship_commitment.hex(),
        "tcapRelationshipReference": tcap_relationship_reference.hex(),
        "tcapPolicyCommitment": tcap_policy_commitment.hex(),
    }

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

async def find_tins_owner_hash_by_tin(tin: str) -> Optional[str]:
    rpc_response = await solana_rpc(
        "getProgramAccounts",
        [
            TINS_PROGRAM_ID,
            {"encoding": "base64", "commitment": "confirmed"},
        ],
    )
    accounts = rpc_response.get("result") or []
    for account in accounts:
        encoded = (((account.get("account") or {}).get("data") or [None])[0])
        if not encoded:
            continue
        try:
            decoded = decode_tin_account_header(base64.b64decode(encoded))
        except (ValueError, binascii.Error, TypeError):
            continue
        if str(decoded.get("tin")) == str(tin):
            return str(decoded.get("ownerPubkeyHash") or "").lower()
    return None


async def read_onchain_tin_pru_route(tin: str) -> Optional[dict[str, Any]]:
    """Recover a finalized route when Receiver lacks the historical operation.

    TIN upgrades can predate the current Receiver deployment.  In that case
    the on-chain account is authoritative.  Only the encrypted public route
    envelope is opened here; the device master-seed envelope is never read or
    decrypted by the Node.
    """
    tin_bytes = int(tin).to_bytes(8, "little", signed=False)
    rpc_response = await solana_rpc(
        "getProgramAccounts",
        [
            TINS_PROGRAM_ID,
            {
                "encoding": "base64",
                "commitment": "confirmed",
                "filters": [
                    {"memcmp": {"offset": 0, "bytes": encode_base58(tin_bytes)}}
                ],
            },
        ],
    )
    accounts = rpc_response.get("result") or []
    for account in accounts:
        encoded = (((account.get("account") or {}).get("data") or [None])[0])
        if not encoded:
            continue
        try:
            material = decode_tin_account_route_material(base64.b64decode(encoded))
            if material["tin"] != str(tin):
                continue
            if int(material.get("tcapRouteVersion") or 0) == 1:
                # A TCap relationship is commitment-only. Never turn it into
                # a PRU inventory or a Cranker payout route.
                raise ValueError("Active TCap TIN has no PRU route; use the ConfidentialSettlement relationship path")
            snapshot = _decrypt_public_route_envelope(
                encrypted_envelope_base64=material["encryptedPublicRouteEnvelope"],
                expected_tin=str(tin),
                expected_configuration_hash=material["pruConfigurationHash"],
                expected_route_version=int(material["routeVersion"]),
                expected_route_nonce=material["routeNonce"],
            )
        except HTTPException as exc:
            if exc.status_code >= 500:
                raise
            logger.warning("On-chain TIN route recovery rejected: tin=%s reason=%s", tin, exc)
            continue
        except (ValueError, TypeError, binascii.Error) as exc:
            logger.warning("On-chain TIN route recovery rejected: tin=%s reason=%s", tin, exc)
            continue
        identity = str(account.get("pubkey") or "")
        return {
            "tin": str(tin),
            "intentId": f"onchain:{identity}:{material['routeVersion']}",
            "ownerPubkeyHash": material["ownerPubkeyHash"],
            "pruConfigurationHash": str(snapshot["pruConfigurationHash"]),
            "routeVersion": int(snapshot["routeVersion"]),
            "routeNonce": str(snapshot["routeNonce"]),
            "prus": snapshot["prus"],
            "status": "finalized",
            "source": "onchain_tin_account",
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
    return None


async def read_onchain_tin_tcap_relationship(tin: str) -> Optional[dict[str, Any]]:
    """Read only the public TCap relationship commitments for a TIN.

    This is the active TIN integration boundary. It never opens the device
    seed envelope, never reads a PRU inventory, and never returns a spendable
    route. The returned commitments are bindings for GPRU/TSN authorization;
    the privacy-receiving root and snapshot key remain device-only.
    """
    tin_bytes = int(tin).to_bytes(8, "little", signed=False)
    rpc_response = await solana_rpc(
        "getProgramAccounts",
        [
            TINS_PROGRAM_ID,
            {
                "encoding": "base64",
                "commitment": "confirmed",
                "filters": [{"memcmp": {"offset": 0, "bytes": encode_base58(tin_bytes)}}],
            },
        ],
    )
    for account in rpc_response.get("result") or []:
        encoded = (((account.get("account") or {}).get("data") or [None])[0])
        if not encoded:
            continue
        try:
            material = decode_tin_account_route_material(base64.b64decode(encoded))
        except (ValueError, TypeError, binascii.Error):
            continue
        if material.get("tin") != str(tin) or int(material.get("tcapRouteVersion") or 0) != 1:
            continue
        return {
            "tin": str(tin),
            "ownerPubkeyHash": material["ownerPubkeyHash"],
            "tcapRouteVersion": 1,
            "tcapRelationshipCommitment": material["tcapRelationshipCommitment"],
            "tcapRelationshipReference": material["tcapRelationshipReference"],
            "tcapPolicyCommitment": material["tcapPolicyCommitment"],
        }
    return None

async def verify_onchain_tin_for_shadow_import(operation: dict[str, Any]) -> Optional[dict[str, Any]]:
    identity_pubkey = get_tins_identity_pda(str(operation["ownerPubkey"]))
    data = await read_tins_account_data(identity_pubkey)
    if not data:
        return None
    try:
        decoded = decode_tin_account_header(data)
    except ValueError:
        return None
    if decoded["tin"] != str(operation["tin"]):
        return None
    owner_pubkey_bytes = decode_base58(str(operation["ownerPubkey"]))
    expected_owner_hash = hashlib.sha256(owner_pubkey_bytes).hexdigest()
    legacy_owner_marker = owner_pubkey_bytes.hex()
    legacy_identity_marker = decode_base58(str(identity_pubkey)).hex()
    owner_pubkey_hash = str(decoded.get("ownerPubkeyHash") or "")
    if owner_pubkey_hash not in {expected_owner_hash, legacy_owner_marker, legacy_identity_marker}:
        return None
    return {
        "tin": decoded["tin"],
        "ownerPubkey": operation["ownerPubkey"],
        "identityPubkey": str(identity_pubkey),
        "ownerPubkeyHash": owner_pubkey_hash,
        "displayName": decoded["displayName"],
        "settlementAuthority": None,
        "settlementAuthorityVerified": False,
    }


async def read_tin_fee_config() -> dict[str, int]:
    global _tin_fee_config_cache, _tin_fee_config_cache_expires_at
    now = time.time()
    if _tin_fee_config_cache and _tin_fee_config_cache_expires_at > now:
        return dict(_tin_fee_config_cache)

    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getAccountInfo",
        "params": [
            str(get_mother_escrow_pda()),
            {"encoding": "base64", "commitment": "confirmed"},
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.post(TSN_SOLANA_RPC_URL, json=payload)
        response.raise_for_status()
        rpc_response = response.json()
        value = rpc_response.get("result", {}).get("value")
        encoded = ((value.get("data") or [None])[0]) if value else None
        if encoded:
            data = base64.b64decode(encoded)
            minimum_length = 8 + 32 + 32 + 32 + 8 + 8 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 8 + 8 + 1
            if len(data) >= minimum_length:
                offset = 8 + 32 + 32 + 32 + 8 + 8 + 2 + 2 + 2
                config = {
                    "verifier": int.from_bytes(data[offset:offset + 2], "little"),
                    "submitter": int.from_bytes(data[offset + 2:offset + 4], "little"),
                    "team": int.from_bytes(data[offset + 4:offset + 6], "little"),
                    "reserve_pool": int.from_bytes(data[offset + 6:offset + 8], "little"),
                }
                _tin_fee_config_cache = config
                _tin_fee_config_cache_expires_at = now + 60
                return dict(config)
    except (httpx.HTTPError, ValueError, binascii.Error):
        pass

    _tin_fee_config_cache = dict(TIN_FEE_SPLIT_BPS)
    _tin_fee_config_cache_expires_at = now + 15
    return dict(TIN_FEE_SPLIT_BPS)

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
    paymentId:        str           = Field(..., description="Unique payment ID")
    intentSeedHash:   str           = Field(..., description="SHA-256 hex of paymentId")
    recipientHash:    str           = Field(..., description="Hashed recipient")
    recipientTin:     Optional[str] = Field(
        None,
        description="Recipient TIN used by private settlement routing. Public responses do not expose it.",
    )
    recipientRouteCommitment: str = Field(..., description="Finalized recipient PRU route commitment signed by the sender")
    recipientRouteVersion: int = Field(..., description="Finalized recipient PRU route version signed by the sender")
    tokenMintAddress: str           = Field(..., description="SPL token mint address")
    amount:           float         = Field(..., description="Payment amount")
    recipientAmount:  Optional[float] = Field(None, description="Amount paid to recipient; amount minus this is protocol fee")
    underlyingPayment: Optional[str] = Field(None, description="Protocol payment reference for the authorization")
    senderWallet: Optional[str] = Field(None, description="Wallet that signed the TSN payment authorization")
    senderAuthorizationMessage: Optional[str] = Field(None, description="Canonical TSN payment authorization message")
    senderAuthorizationSignature: Optional[str] = Field(None, description="Wallet signature over the authorization message")
    senderAuthorizationNonce: Optional[str] = Field(None, description="Unique authorization nonce")
    senderAuthorizationIssuedAt: Optional[str] = Field(None, description="Authorization issue timestamp")
    senderAuthorizationExpiresAt: Optional[str] = Field(None, description="Authorization expiry timestamp")
    senderFeeAmount: Optional[float] = Field(None, description="Sender-side protocol fee routed to treasury")
    senderSignedFundingTransaction: Optional[str] = Field(None, description="Sender-signed epoch funding transaction for Cranker sponsorship")
    senderSignedFundingFeePayer: Optional[str] = Field(None, description="Cranker fee payer expected to complete and broadcast funding")
    senderFundingMode: Optional[str] = Field(None, description="Funding authority model")
    privacyVersion: Optional[int] = Field(None, description="TSN private settlement protocol version")
    senderTokenAccount: Optional[str] = Field(None, description="Sender token account used by the sponsored settlement")
    transferId: Optional[str] = Field(None, description="Public transfer identifier committed by the payment vault")
    commitmentHash: Optional[str] = Field(None, description="SHA-256 commitment to the encrypted settlement secret")
    settlementEpoch: Optional[int] = Field(None, description="Epoch in which this authorization may be settled")
    encryptedSettlementToken: Optional[dict[str, Any]] = Field(
        None,
        description="Off-chain encrypted recipient route. Never written to the public commitment registry.",
    )
    source:            Optional[str] = Field(None)

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
    privacyVersion: Optional[int] = None
    source: Optional[str] = None
    status: str
    assignedCrankerPubkey: Optional[str] = None
    fundingTxSig: Optional[str] = None
    settlementTxSig: Optional[str] = None
    settlementResolution: Optional[str] = None
    settlementReason: Optional[str] = None
    postedAt: str
    updatedAt: str

TIN_OPERATION_STATUSES = {
    "pending_verification",
    "verifier_assigned",
    "verified",
    "fee_pending",
    "fee_committed",
    "submitter_assigned",
    "submitted_onchain",
    "finalized",
    "rejected",
    "expired",
    "failed",
}
TIN_OPERATION_TERMINAL_STATUSES = {"finalized", "rejected", "expired", "failed"}
TIN_CREATION_FEE_BASE_UNITS = 50_000
TIN_UPDATE_FEE_BASE_UNITS = 10_000
TIN_DEFAULT_FEE_MINT = DEVNET_USDC_MINT
TIN_FEE_SPLIT_BPS = {
    "verifier": 3_000,
    "submitter": 4_000,
    "team": 2_000,
    "reserve_pool": 1_000,
}
TIN_DEFAULT_PRU_COUNT = 30
TIN_OWNER_INTENT_CREATE_DOMAIN_V1 = "TINS_CREATE_INTENT_V1"
TIN_OWNER_INTENT_UPDATE_DOMAIN_V1 = "TINS_UPDATE_INTENT_V1"
TIN_OWNER_INTENT_CREATE_DOMAIN_V2 = "TINS_CREATE_OWNER_INTENT_V2"
TIN_OWNER_INTENT_UPDATE_DOMAIN_V2 = "TINS_UPDATE_OWNER_INTENT_V2"
TIN_PRIVATE_METADATA_DOMAIN_V1 = "TINS_PRIVATE_METADATA_V1"
TIN_PRU_CONFIGURATION_TAG = "TSN_V1_TOKEN_AGNOSTIC_PRU_CONFIGURATION"
# Keep the route-envelope identifiers in one place.  These are the canonical
# identifiers emitted by the TSN SDK; the Node must validate the same wire
# format rather than an older, suffixed variant.
TIN_PUBLIC_ROUTE_ENVELOPE_VERSION = "tsn-tin-public-route-envelope"
TIN_PUBLIC_ROUTE_ENCRYPTION_ALGORITHM = "x25519-xsalsa20-poly1305"

class TinOperationFeeRecord(BaseModel):
    intentId: str
    feeMint: str
    grossAmount: str
    verifierAmount: str
    submitterAmount: str
    teamAmount: str
    reservePoolAmount: str
    verifierPubkey: Optional[str] = None
    submitterPubkey: Optional[str] = None
    teamPubkey: Optional[str] = None
    reservePoolPubkey: Optional[str] = None
    feeCommitmentTx: Optional[str] = None
    feeCommitmentHash: str
    status: Literal["pending", "committed", "distributed", "failed"] = "pending"
    createdAt: str
    updatedAt: str

class TinPruPublicAddress(BaseModel):
    index: int
    publicKey: str
    state: str

class TinPruRoutePublicResponse(BaseModel):
    tin: str
    pruConfigurationHash: str
    status: Literal["finalized"]
    prus: list[TinPruPublicAddress]

class TinPruRouteSessionRequest(BaseModel):
    tin: str
    owner_pubkey: str
    signature: str
    nonce: str
    timestamp: int
    signed_message_base64: Optional[str] = None

class TinPruRouteSessionResponse(BaseModel):
    token: str
    expiresAt: int
    tin: str

class TinDelegatedReadRequest(BaseModel):
    tin: str
    owner_pubkey: str
    platform_read_key: str
    signature: str
    nonce: str
    timestamp: int
    expiry: Optional[int] = None
    signed_message_base64: Optional[str] = None

class TinDelegatedReadResponse(BaseModel):
    tin: str
    platformReadKey: str
    expiresAt: Optional[int] = None
    status: Literal["active", "revoked"]

class TinDelegatedPlatformRecord(BaseModel):
    platformReadKey: str
    contact: Optional[str] = None
    expiresAt: int

class PlatformReadKeyRegistrationRequest(BaseModel):
    platform_read_key: str
    contact: str

class PlatformReadKeyRegistrationResponse(BaseModel):
    platformReadKey: str
    contact: str
    status: Literal["registered"]

class TinOperationRecord(BaseModel):
    intentId: str
    intentType: Literal["tin_creation", "tin_update"]
    tin: str
    ownerPubkey: str
    ownerSignature: str
    ownerIntentHash: str
    ownerIntentMessage: Optional[str] = None
    nonce: str
    expiry: int
    createdAt: str
    updatedAt: str
    status: Literal[
        "pending_verification",
        "verifier_assigned",
        "verified",
        "fee_pending",
        "fee_committed",
        "submitter_assigned",
        "submitted_onchain",
        "finalized",
        "rejected",
        "expired",
        "failed",
    ]
    verifierCranker: Optional[str] = None
    submitterCranker: Optional[str] = None
    feeMetadata: Optional[dict[str, Any]] = None
    failureReason: Optional[str] = None
    onchainSignatures: list[str] = Field(default_factory=list)
    displayName: Optional[str] = None
    encryptedMasterSeed: Optional[str] = None
    encryptedMetadataHash: str
    pruConfigurationHash: str
    encryptedPublicRouteEnvelope: Optional[str] = None
    routeVersion: Optional[int] = None
    routeNonce: Optional[str] = None
    creationFeeAmount: Optional[str] = None
    creationFeeMint: Optional[str] = None
    newDisplayName: Optional[str] = None
    newEncryptedMasterSeed: Optional[str] = None
    newEncryptedMetadataHash: Optional[str] = None
    newPruConfigurationHash: Optional[str] = None
    newEncryptedPublicRouteEnvelope: Optional[str] = None
    newRouteVersion: Optional[int] = None
    newRouteNonce: Optional[str] = None
    updateFeeAmount: Optional[str] = None
    updateFeeMint: Optional[str] = None

class PublicTinOperationRecord(BaseModel):
    intentId: str
    intentType: str
    tinHash: str
    ownerPubkey: str
    ownerIntentHash: str
    nonce: str
    expiry: int
    createdAt: str
    updatedAt: str
    status: str
    verifierCranker: Optional[str] = None
    submitterCranker: Optional[str] = None
    feeMetadata: Optional[dict[str, Any]] = None
    failureReason: Optional[str] = None
    onchainSignatures: list[str] = Field(default_factory=list)
    displayName: Optional[str] = None
    encryptedMetadataHash: str
    pruConfigurationHash: str
    routeVersion: Optional[int] = None

class TinOperationStageRequest(BaseModel):
    crankerPubkey: Optional[str] = None
    verifierCranker: Optional[str] = None
    submitterCranker: Optional[str] = None
    feeCommitmentTx: Optional[str] = None
    txSignature: Optional[str] = None
    onchainSignature: Optional[str] = None
    failureReason: Optional[str] = None
    reason: Optional[str] = None

class SignedLeasePermitRequest(BaseModel):
    operatorPubkey: str
    requestedAtTs: int
    requestSignatureBase64: str

class PrivatePayoutPermitResponse(BaseModel):
    permitSigner: str
    permitSignatureBase64: str
    payoutNullifier: str
    tokenMintAddress: str
    recipientWallet: str
    payoutAmountBaseUnits: str
    claimFeeAmountBaseUnits: str
    settlementDna: str
    settlementCommitment: str
    epochTreasury: str
    epochLedger: str
    claimSlot: str
    commitmentDigest: str
    randomNonce: str
    leaseId: str
    leaseVersion: int
    leaseExpiresAt: str
    expiresAtTs: int

class PruSpendPermitSelection(BaseModel):
    tin: str
    pruIndex: int
    nonce: int
    publicKey: str
    spendAuthHash: str
    amountBaseUnits: str

class PruSpendPermitResponse(BaseModel):
    paymentId: str
    tokenMintAddress: str
    commitmentHash: str
    fundingAmountBaseUnits: str
    senderFeeAmountBaseUnits: str
    selections: list[PruSpendPermitSelection]
    executionPlanV2: dict[str, Any]

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

def intent_submission_work(intent: MempoolIntent) -> MempoolIntent:
    data = intent.model_dump()
    encrypted = data.get("encryptedSettlementToken")
    if isinstance(encrypted, dict):
        data["encryptedSettlementToken"] = {
            **encrypted,
            "ciphertextBase64": "",
            "nonceBase64": "",
            "ephemeralPublicKeyBase64": "",
        }
    return MempoolIntent(**data)

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
        "TSN TIN Upgrade\n"
        "---\n"
        f"Intent Hash: {intent_hash.hex()}\n"
        "Domain: TSN_TIN_OWNER_INTENT_V1"
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

def _require_phone_number(payload: dict[str, Any], intent_type: str) -> str:
    phone_number = _require_string(
        payload,
        "phone_number",
        "phoneNumber",
        *(
            ("new_phone_number", "newPhoneNumber")
            if intent_type == "tin_update"
            else ()
        ),
    )
    if not phone_number.strip():
        raise HTTPException(422, "phone_number is required")
    return phone_number.strip()

def _compute_owner_intent_hash_v2(
    *,
    intent_type: str,
    owner_bytes: bytes,
    tin: str,
    display_name: str,
    phone_number: str,
    nonce_bytes: bytes,
    expiry: int,
) -> bytes:
    domain = (
        TIN_OWNER_INTENT_CREATE_DOMAIN_V2
        if intent_type == "tin_creation"
        else TIN_OWNER_INTENT_UPDATE_DOMAIN_V2
    )
    return hashlib.sha256(
        b"".join(
            [
                domain.encode("utf-8"),
                owner_bytes,
                tin.encode("utf-8"),
                display_name.encode("utf-8"),
                phone_number.encode("utf-8"),
                nonce_bytes,
                _encode_signed_i64_le(expiry),
            ]
        )
    ).digest()

def _build_owner_intent_message_v2(
    *,
    intent_type: str,
    owner_pubkey: str,
    tin: str,
    display_name: str,
    phone_number: str,
    nonce: str,
    expiry: int,
) -> str:
    if intent_type == "tin_creation":
        action = "TIN Creation"
        fields = [
            ("TIN", tin),
            ("Display Name", display_name),
            ("Privacy", "30 PRUs"),
            ("Nonce", nonce.lower()),
            ("Expires", datetime.fromtimestamp(expiry, tz=timezone.utc).isoformat().replace("+00:00", "Z")),
        ]
    else:
        action = "TIN Upgrade"
        fields = [
            ("TIN", tin),
            ("Display Name", display_name),
            ("Nonce", nonce.lower()),
            ("Expires", datetime.fromtimestamp(expiry, tz=timezone.utc).isoformat().replace("+00:00", "Z")),
        ]
    return _build_canonical_message(action, fields)

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

async def _verify_payment_authorization_from_signed_message(req: CreateIntentRequest) -> dict[str, Any]:
    mode = req.senderFundingMode or ""
    if mode not in {"", "wallet_only_v2", "epoch_treasury_v1", "sponsored_sender_cosigned"}:
        raise HTTPException(400, "ZK-PRU funding modes are retired; use epoch-treasury funding")
    action = "Payment Intent"
    fields = _parse_canonical_message(req.senderAuthorizationMessage or "", action)
    amount_base_units = _parse_usdc_base_units(str(fields.get("Amount") or ""), "Amount")
    fee_base_units = _parse_usdc_base_units(str(fields.get("Fee") or ""), "Fee")
    recipient_tin = str(fields.get("Recipient TIN") or "")
    if not re.fullmatch(r"\d+", recipient_tin):
        raise HTTPException(400, "Recipient TIN must be plain digits in the signed message")
    if req.recipientTin and req.recipientTin != recipient_tin:
        raise HTTPException(400, "recipientTin differs from the signed message")
    recipient_route_commitment = str(fields.get("Recipient Route Commitment") or "").lower()
    if not re.fullmatch(r"[a-f0-9]{64}", recipient_route_commitment):
        raise HTTPException(400, "Recipient Route Commitment must be a 32-byte hexadecimal commitment")
    try:
        recipient_route_version = int(str(fields.get("Recipient Route Version") or ""))
    except ValueError as exc:
        raise HTTPException(400, "Recipient Route Version must be a positive integer") from exc
    if recipient_route_version < 1:
        raise HTTPException(400, "Recipient Route Version must be a positive integer")
    if str(req.recipientRouteCommitment or "").lower() != recipient_route_commitment:
        raise HTTPException(400, "recipientRouteCommitment differs from the signed message")
    if int(req.recipientRouteVersion or 0) != recipient_route_version:
        raise HTTPException(400, "recipientRouteVersion differs from the signed message")
    token_decimals = int(get_supported_token_metadata().get(str(req.tokenMintAddress), {}).get("decimals", 6))
    request_amount_base_units = ui_amount_to_base_units(req.amount, token_decimals)
    if amount_base_units != request_amount_base_units:
        raise HTTPException(400, "amount differs from the signed message")
    request_fee_base_units = ui_amount_to_base_units(req.senderFeeAmount or 0, token_decimals)
    if fee_base_units != request_fee_base_units:
        raise HTTPException(400, "senderFeeAmount differs from the signed message")
    if req.senderAuthorizationNonce and req.senderAuthorizationNonce != fields.get("Nonce"):
        raise HTTPException(400, "senderAuthorizationNonce differs from the signed message")
    expires_at = _parse_canonical_expiry(str(fields.get("Expires") or ""))
    if req.senderAuthorizationExpiresAt:
        submitted_expiry = datetime.fromisoformat(req.senderAuthorizationExpiresAt.replace("Z", "+00:00"))
        if submitted_expiry != expires_at:
            raise HTTPException(400, "senderAuthorizationExpiresAt differs from the signed message")
    sender_public_key = str(req.senderWallet or "").strip()
    _verify_ed25519_signature(
        public_key=sender_public_key,
        message=(req.senderAuthorizationMessage or "").encode("utf-8"),
        signature_base64=str(req.senderAuthorizationSignature or ""),
    )
    await _assert_canonical_nonce_unused(
        action=action,
        authorization_domain=str(fields.get("Domain") or "").strip(),
        sender_public_key=sender_public_key,
        nonce=str(fields.get("Nonce") or "").strip(),
    )
    return {
        "recipientTin": recipient_tin,
        "recipientRouteCommitment": recipient_route_commitment,
        "recipientRouteVersion": recipient_route_version,
        "senderAuthorizationNonce": str(fields["Nonce"]),
        "senderAuthorizationExpiresAt": expires_at.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    }

def _routing_private_key() -> PrivateKey:
    if not TSN_ROUTE_DECRYPTION_PRIVATE_KEY:
        raise HTTPException(503, "TSN Node routing decryption key is not configured")
    try:
        key_bytes = decode_secret_key(
            TSN_ROUTE_DECRYPTION_PRIVATE_KEY,
            {32},
            "TSN_ROUTE_DECRYPTION_PRIVATE_KEY",
        )
        return PrivateKey(key_bytes)
    except (ValueError, TypeError, binascii.Error) as exc:
        raise HTTPException(503, "TSN Node routing decryption key is invalid") from exc


def _decrypt_public_route_envelope(
    *,
    encrypted_envelope_base64: str,
    expected_tin: str,
    expected_configuration_hash: str,
    expected_route_version: int,
    expected_route_nonce: str,
) -> dict[str, Any]:
    try:
        envelope_bytes = base64.b64decode(encrypted_envelope_base64, validate=True)
        envelope = json.loads(envelope_bytes.decode("utf-8"))
        if envelope.get("version") != TIN_PUBLIC_ROUTE_ENVELOPE_VERSION:
            raise ValueError("unsupported route envelope version")
        if envelope.get("algorithm") != TIN_PUBLIC_ROUTE_ENCRYPTION_ALGORITHM:
            raise ValueError("unsupported route envelope algorithm")
        ephemeral_public_key = Curve25519PublicKey(
            base64.b64decode(str(envelope["ephemeralPublicKey"]), validate=True)
        )
        nonce = base64.b64decode(str(envelope["nonce"]), validate=True)
        ciphertext = base64.b64decode(str(envelope["ciphertext"]), validate=True)
        plaintext = Box(_routing_private_key(), ephemeral_public_key).decrypt(
            ciphertext,
            nonce,
        )
        payload = json.loads(plaintext.decode("utf-8"))
    except (
        KeyError,
        ValueError,
        TypeError,
        UnicodeDecodeError,
        json.JSONDecodeError,
        CryptoError,
        binascii.Error,
    ) as exc:
        raise HTTPException(422, "Encrypted public PRU route envelope is invalid") from exc

    if str(payload.get("tin") or "") != expected_tin:
        raise HTTPException(422, "Public PRU route envelope belongs to another TIN")
    if int(payload.get("routeVersion") or 0) != expected_route_version:
        raise HTTPException(422, "Public PRU route version does not match the signed operation")
    if str(payload.get("routeNonce") or "").lower() != expected_route_nonce.lower():
        raise HTTPException(422, "Public PRU route nonce does not match the signed operation")
    if str(payload.get("pruConfigurationHash") or "").lower() != expected_configuration_hash.lower():
        raise HTTPException(422, "Public PRU route commitment does not match the signed operation")

    public_prus = payload.get("prus")
    if not isinstance(public_prus, list) or len(public_prus) != TIN_DEFAULT_PRU_COUNT:
        raise HTTPException(422, f"Public PRU route must contain exactly {TIN_DEFAULT_PRU_COUNT} entries")
    canonical_lines: list[str] = []
    normalized_prus: list[dict[str, Any]] = []
    seen_indexes: set[int] = set()
    for item in sorted(public_prus, key=lambda row: int(row.get("index", -1))):
        if not isinstance(item, dict):
            raise HTTPException(422, "Public PRU route entry is invalid")
        index = int(item.get("index", -1))
        public_key_hex = str(item.get("publicKeyHex") or "").lower()
        public_key = str(item.get("publicKey") or "")
        if index in seen_indexes or index < 0 or index >= TIN_DEFAULT_PRU_COUNT:
            raise HTTPException(422, "Public PRU route indexes must be unique and canonical")
        seen_indexes.add(index)
        if not re.fullmatch(r"[a-f0-9]{64}", public_key_hex):
            raise HTTPException(422, "Public PRU route contains an invalid public key")
        if encode_base58(bytes.fromhex(public_key_hex)) != public_key:
            raise HTTPException(422, "Public PRU route public-key encodings disagree")
        state = str(item.get("state") or "ACTIVE")
        if state not in {"PLANNED", "ACTIVE", "USED", "SWEPT"}:
            raise HTTPException(422, "Public PRU route contains an invalid lifecycle state")
        canonical_lines.append(f"{expected_tin}:{index}:{public_key_hex}:")
        normalized_prus.append(
            {
                "index": index,
                "publicKey": public_key,
                "publicKeyHex": public_key_hex,
                "state": state,
            }
        )
    derived_hash = _sha256_hex_utf8(
        TIN_PRU_CONFIGURATION_TAG,
        "\n".join(canonical_lines),
    )
    if not secrets.compare_digest(derived_hash, expected_configuration_hash.lower()):
        raise HTTPException(422, "Public PRU route does not match the PRU configuration commitment")
    return {
        "tin": expected_tin,
        "routeVersion": expected_route_version,
        "routeNonce": expected_route_nonce.lower(),
        "pruConfigurationHash": expected_configuration_hash.lower(),
        "prus": normalized_prus,
    }

def _normalize_tin_operation_input(payload: dict[str, Any]) -> dict[str, Any]:
    intent_type = _require_string(payload, "intent_type", "intentType")
    if intent_type not in {"tin_creation", "tin_update"}:
        raise HTTPException(422, "intent_type must be tin_creation or tin_update")

    intent_id = str(_field(payload, "intent_id", "intentId", default=str(uuid4()))).strip()
    if not intent_id:
        raise HTTPException(422, "intent_id must not be empty")

    tin = _require_string(payload, "tin")
    encrypted_master_seed = _field(payload, "encrypted_master_seed", "encryptedMasterSeed")
    if encrypted_master_seed is None:
        encrypted_master_seed = _field(payload, "new_encrypted_master_seed", "newEncryptedMasterSeed")
    encrypted_master_seed = str(encrypted_master_seed or "").strip()
    encrypted_metadata_hash = str(
        _field(
            payload,
            "encrypted_metadata_hash",
            "encryptedMetadataHash",
            "new_encrypted_metadata_hash",
            "newEncryptedMetadataHash",
            default="",
        )
        or ""
    ).strip()
    pru_configuration_hash = str(
        _field(
            payload,
            "pru_configuration_hash",
            "pruConfigurationHash",
            "new_pru_configuration_hash",
            "newPruConfigurationHash",
            default="",
        )
        or ""
    ).strip()
    encrypted_public_route_envelope = str(
        _field(
            payload,
            "encrypted_public_route_envelope",
            "encryptedPublicRouteEnvelope",
            "new_encrypted_public_route_envelope",
            "newEncryptedPublicRouteEnvelope",
            default="",
        )
        or ""
    ).strip()
    route_version_raw = _field(
        payload,
        "route_version",
        "routeVersion",
        "new_route_version",
        "newRouteVersion",
        default=0,
    )
    route_nonce = str(
        _field(
            payload,
            "route_nonce",
            "routeNonce",
            "new_route_nonce",
            "newRouteNonce",
            default="",
        )
        or ""
    ).strip()
    owner_intent_hash = _require_string(payload, "owner_intent_hash", "ownerIntentHash")
    owner_intent_message = str(_field(payload, "owner_intent_message", "ownerIntentMessage", default="") or "")
    nonce = _require_string(payload, "nonce")
    owner_pubkey = _require_string(payload, "owner_pubkey", "ownerPubkey")
    owner_signature = _require_string(payload, "owner_signature", "ownerSignature")
    display_name = str(_field(payload, "display_name", "displayName", "new_display_name", "newDisplayName", default="")).strip()
    if not display_name:
        raise HTTPException(422, "display_name is required")

    owner_bytes = _decode_owner_pubkey(owner_pubkey)
    intent_hash_bytes = _decode_hash32(owner_intent_hash, "owner_intent_hash")
    nonce_bytes = _decode_hash32(nonce, "nonce")
    signature_bytes = _decode_base64_blob(owner_signature, "owner_signature")
    if len(signature_bytes) != 64:
        raise HTTPException(422, "owner_signature must be a 64-byte Ed25519 signature")
    expiry = _expiry_from_input(_field(payload, "expiry", "expiry_ts", "expiryTs"))
    encrypted_master_seed_bytes = _decode_base64_blob(
        encrypted_master_seed,
        "encrypted_master_seed",
    )
    metadata_hash_bytes = _decode_hash32(
        encrypted_metadata_hash,
        "encrypted_metadata_hash",
    )
    configuration_hash_bytes = _decode_hash32(
        pru_configuration_hash,
        "pru_configuration_hash",
    )
    encrypted_public_route_envelope_bytes = _decode_base64_blob(
        encrypted_public_route_envelope,
        "encrypted_public_route_envelope",
    )
    try:
        route_version = int(route_version_raw)
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, "route_version must be a positive integer") from exc
    if route_version < 1:
        raise HTTPException(422, "route_version must be a positive integer")
    route_nonce_bytes = _decode_hash32(route_nonce, "route_nonce")
    domain = (
        TIN_OWNER_INTENT_CREATE_DOMAIN_V1
        if intent_type == "tin_creation"
        else TIN_OWNER_INTENT_UPDATE_DOMAIN_V1
    )
    expected_hash = hashlib.sha256(
        b"".join(
            [
                domain.encode("utf-8"),
                owner_bytes,
                display_name.encode("utf-8"),
                encrypted_master_seed_bytes,
                metadata_hash_bytes,
                configuration_hash_bytes,
                encrypted_public_route_envelope_bytes,
                route_version.to_bytes(8, "little", signed=False),
                route_nonce_bytes,
                nonce_bytes,
                _encode_signed_i64_le(expiry),
            ]
        )
    ).digest()
    pru_route = _decrypt_public_route_envelope(
        encrypted_envelope_base64=encrypted_public_route_envelope,
        expected_tin=tin,
        expected_configuration_hash=configuration_hash_bytes.hex(),
        expected_route_version=route_version,
        expected_route_nonce=route_nonce,
    )
    if not secrets.compare_digest(expected_hash, intent_hash_bytes):
        raise HTTPException(422, "owner_intent_hash does not match the submitted TIN operation payload")
    # Browser wallets commonly reject arbitrary binary payloads for
    # signMessage.  Accept the exact 32-byte commitment for low-level
    # signers, or the deterministic printable wrapper used by the frontend.
    # In both cases the signature is still bound to the recomputed hash above.
    signed_message = intent_hash_bytes
    if owner_intent_message:
        signed_message = owner_intent_message.encode("utf-8")
        if signed_message != _canonical_tin_owner_intent_message(intent_hash_bytes):
            raise HTTPException(422, "ownerIntentMessage must be the canonical TIN upgrade message")
    try:
        VerifyKey(owner_bytes).verify(signed_message, signature_bytes)
    except BadSignatureError as exc:
        raise HTTPException(401, "owner_signature is invalid for owner_intent_hash") from exc

    fee_amount = _field(
        payload,
        "creation_fee_amount" if intent_type == "tin_creation" else "update_fee_amount",
        "creationFeeAmount" if intent_type == "tin_creation" else "updateFeeAmount",
        default=str(TIN_CREATION_FEE_BASE_UNITS if intent_type == "tin_creation" else TIN_UPDATE_FEE_BASE_UNITS),
    )
    fee_mint = str(
        _field(
            payload,
            "creation_fee_mint" if intent_type == "tin_creation" else "update_fee_mint",
            "creationFeeMint" if intent_type == "tin_creation" else "updateFeeMint",
            default=TIN_DEFAULT_FEE_MINT,
        )
    )
    now_iso = datetime.now(timezone.utc).isoformat()
    base: dict[str, Any] = {
        "intentId": intent_id,
        "intentType": intent_type,
        "tin": tin,
        "ownerPubkey": owner_pubkey,
        "ownerSignature": owner_signature,
        "ownerIntentHash": owner_intent_hash.lower(),
        "ownerIntentMessage": owner_intent_message or None,
        "nonce": nonce.lower(),
        "expiry": expiry,
        "createdAt": now_iso,
        "updatedAt": now_iso,
        "status": "pending_verification",
        "verifierCranker": None,
        "submitterCranker": None,
        "feeMetadata": None,
        "failureReason": None,
        "onchainSignatures": [],
        "displayName": display_name if intent_type == "tin_creation" else None,
        "encryptedMasterSeed": encrypted_master_seed if intent_type == "tin_creation" else None,
        "encryptedMetadataHash": encrypted_metadata_hash.lower(),
        "pruConfigurationHash": pru_configuration_hash.lower(),
        "encryptedPublicRouteEnvelope": encrypted_public_route_envelope if intent_type == "tin_creation" else None,
        "routeVersion": route_version if intent_type == "tin_creation" else None,
        "routeNonce": route_nonce.lower() if intent_type == "tin_creation" else None,
        "creationFeeAmount": str(fee_amount) if intent_type == "tin_creation" else None,
        "creationFeeMint": fee_mint if intent_type == "tin_creation" else None,
        "newDisplayName": display_name if intent_type == "tin_update" else None,
        "newEncryptedMasterSeed": encrypted_master_seed if intent_type == "tin_update" else None,
        "newEncryptedMetadataHash": encrypted_metadata_hash.lower() if intent_type == "tin_update" else None,
        "newPruConfigurationHash": pru_configuration_hash.lower() if intent_type == "tin_update" else None,
        "newEncryptedPublicRouteEnvelope": encrypted_public_route_envelope if intent_type == "tin_update" else None,
        "newRouteVersion": route_version if intent_type == "tin_update" else None,
        "newRouteNonce": route_nonce.lower() if intent_type == "tin_update" else None,
        "updateFeeAmount": str(fee_amount) if intent_type == "tin_update" else None,
        "updateFeeMint": fee_mint if intent_type == "tin_update" else None,
        **({"_pruRoute": pru_route} if pru_route else {}),
    }
    return base

def public_tin_operation(record: TinOperationRecord | dict[str, Any]) -> PublicTinOperationRecord:
    data = record.model_dump() if isinstance(record, TinOperationRecord) else dict(record)
    tin = str(data.pop("tin", ""))
    data["tinHash"] = _sha256_hex_utf8("TSN_PUBLIC_TIN_OPERATION_ID", tin) if tin else ""
    data.pop("encryptedMasterSeed", None)
    data.pop("newEncryptedMasterSeed", None)
    data.pop("encryptedPublicRouteEnvelope", None)
    data.pop("newEncryptedPublicRouteEnvelope", None)
    data.pop("routeNonce", None)
    data.pop("newRouteNonce", None)
    data.pop("ownerSignature", None)
    if data.get("newRouteVersion") is not None:
        data["routeVersion"] = data["newRouteVersion"]
    return PublicTinOperationRecord(**data)

def _fee_amount_base_units(operation: dict[str, Any]) -> int:
    raw = (
        operation.get("creationFeeAmount")
        if operation.get("intentType") == "tin_creation"
        else operation.get("updateFeeAmount")
    )
    if raw is None or str(raw).strip() == "":
        return TIN_CREATION_FEE_BASE_UNITS if operation.get("intentType") == "tin_creation" else TIN_UPDATE_FEE_BASE_UNITS
    value = Decimal(str(raw))
    if value <= 0:
        raise HTTPException(422, "TIN operation fee amount must be positive")
    if value < 1:
        value = value * Decimal(1_000_000)
    if value != value.to_integral_value():
        raise HTTPException(422, "TIN operation fee must resolve to whole USDC base units")
    return int(value)

def compute_tin_fee_split(gross_amount: int) -> dict[str, int]:
    verifier = gross_amount * TIN_FEE_SPLIT_BPS["verifier"] // 10_000
    submitter = gross_amount * TIN_FEE_SPLIT_BPS["submitter"] // 10_000
    team = gross_amount * TIN_FEE_SPLIT_BPS["team"] // 10_000
    reserve_pool = gross_amount - verifier - submitter - team
    return {
        "verifier": verifier,
        "submitter": submitter,
        "team": team,
        "reserve_pool": reserve_pool,
    }

def compute_tin_fee_commitment_hash(operation: dict[str, Any], fee_record: dict[str, Any]) -> str:
    canonical = {
        "domain": "TSN_TIN_FEE_COMMITMENT_V1",
        "intentId": operation["intentId"],
        "intentType": operation["intentType"],
        "tin": operation["tin"],
        "ownerPubkey": operation["ownerPubkey"],
        "ownerIntentHash": operation["ownerIntentHash"],
        "feeMint": fee_record["feeMint"],
        "grossAmount": fee_record["grossAmount"],
        "verifierAmount": fee_record["verifierAmount"],
        "submitterAmount": fee_record["submitterAmount"],
        "teamAmount": fee_record["teamAmount"],
        "reservePoolAmount": fee_record["reservePoolAmount"],
        "verifierPubkey": fee_record.get("verifierPubkey"),
        "submitterPubkey": fee_record.get("submitterPubkey"),
        "teamPubkey": fee_record.get("teamPubkey"),
        "reservePoolPubkey": fee_record.get("reservePoolPubkey"),
    }
    return hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

def append_unique_signature(signatures: Any, tx_sig: str) -> list[str]:
    ordered = [str(signature) for signature in (signatures or []) if signature]
    if tx_sig not in ordered:
        ordered.append(tx_sig)
    return ordered

async def read_shadow_tin_owner(tin: str) -> Optional[str]:
    r = await get_mempool_store()
    raw = await r.hget(k_tin_registry_shadow(), tin)
    if not raw:
        return None
    try:
        value = json.loads(raw)
        return str(value.get("ownerPubkey") or "") or None
    except json.JSONDecodeError:
        return None

async def write_shadow_tin_owner(operation: dict[str, Any]) -> None:
    r = await get_mempool_store()
    await r.hset(
        k_tin_registry_shadow(),
        str(operation["tin"]),
        json.dumps(
            {
                "tin": operation["tin"],
                "ownerPubkey": operation["ownerPubkey"],
                "intentId": operation["intentId"],
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            }
        ),
    )

async def import_shadow_tin_owner(operation: dict[str, Any], onchain: dict[str, Any]) -> None:
    r = await get_mempool_store()
    await r.hset(
        k_tin_registry_shadow(),
        str(operation["tin"]),
        json.dumps(
            {
                "tin": operation["tin"],
                "ownerPubkey": operation["ownerPubkey"],
                "intentId": operation["intentId"],
                "identityPubkey": onchain.get("identityPubkey"),
                "displayName": onchain.get("displayName"),
                "settlementAuthority": onchain.get("settlementAuthority"),
                "settlementAuthorityVerified": True,
                "source": "onchain_legacy_import",
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            }
        ),
    )

async def write_tin_pru_route(operation: dict[str, Any], route: dict[str, Any]) -> None:
    r = await get_mempool_store()
    owner_pubkey_hash = hashlib.sha256(decode_base58(str(operation["ownerPubkey"]))).hexdigest()
    await r.hset(
        k_tin_pru_routes(),
        str(operation["tin"]),
        json.dumps(
            {
                "tin": str(operation["tin"]),
                "intentId": operation["intentId"],
                "ownerPubkeyHash": owner_pubkey_hash,
                "pruConfigurationHash": route["pruConfigurationHash"],
                "routeVersion": route["routeVersion"],
                "routeNonce": route["routeNonce"],
                "prus": route["prus"],
                "status": "pending",
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            }
        ),
    )

async def mark_tin_pru_route_finalized(operation: dict[str, Any]) -> None:
    r = await get_mempool_store()
    raw = await r.hget(k_tin_pru_routes(), str(operation["tin"]))
    if not raw:
        return
    try:
        route = json.loads(raw)
    except json.JSONDecodeError:
        return
    route["status"] = "finalized"
    route["updatedAt"] = datetime.now(timezone.utc).isoformat()
    await r.hset(k_tin_pru_routes(), str(operation["tin"]), json.dumps(route))

async def read_tin_pru_route(tin: str) -> Optional[dict[str, Any]]:
    r = await get_mempool_store()
    raw = await r.hget(k_tin_pru_routes(), str(tin))
    if not raw:
        # Recover only from the Node-readable encrypted public-route envelope.
        # The device master-seed envelope is never opened by the Node.
        for operation in await hget_all_json(k_tin_operations()):
            if str(operation.get("tin") or "") != str(tin) or operation.get("status") != "finalized":
                continue
            encrypted_route = (
                operation.get("newEncryptedPublicRouteEnvelope")
                or operation.get("encryptedPublicRouteEnvelope")
            )
            configuration_hash = (
                operation.get("newPruConfigurationHash")
                or operation.get("pruConfigurationHash")
            )
            route_version = (
                operation.get("newRouteVersion")
                or operation.get("routeVersion")
            )
            route_nonce = (
                operation.get("newRouteNonce")
                or operation.get("routeNonce")
            )
            if not encrypted_route or not configuration_hash or not route_version or not route_nonce:
                continue
            snapshot = _decrypt_public_route_envelope(
                encrypted_envelope_base64=str(encrypted_route),
                expected_tin=str(tin),
                expected_configuration_hash=str(configuration_hash),
                expected_route_version=int(route_version),
                expected_route_nonce=str(route_nonce),
            )
            route = {
                "tin": str(tin),
                "intentId": str(operation.get("intentId") or ""),
                "ownerPubkeyHash": hashlib.sha256(
                    decode_base58(str(operation.get("ownerPubkey") or ""))
                ).hexdigest() if operation.get("ownerPubkey") else None,
                "pruConfigurationHash": str(snapshot["pruConfigurationHash"]),
                "routeVersion": int(snapshot["routeVersion"]),
                "routeNonce": str(snapshot["routeNonce"]),
                "prus": snapshot["prus"],
                "status": "finalized",
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            }
            await r.hset(k_tin_pru_routes(), str(tin), json.dumps(route))
            raw = json.dumps(route)
            break
        else:
            # A TIN may have been upgraded before this Receiver/Node was
            # deployed, so no historical operation record may exist. Recover
            # the current route directly from the verified on-chain account.
            route = await read_onchain_tin_pru_route(str(tin))
            if not route:
                return None
            await r.hset(k_tin_pru_routes(), str(tin), json.dumps(route))
            logger.info(
                "Recovered finalized TIN PRU route from on-chain account: tin=%s version=%s",
                tin,
                route["routeVersion"],
            )
            return route
    try:
        route = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if route.get("status") != "finalized":
        # Route publication and TIN finalization are separate writes.  A
        # transient failure between them used to leave a permanently pending
        # route even though the owning TIN operation was finalized on-chain.
        # Reconcile that state before declaring the route unavailable.
        finalized_operation = next(
            (
                item
                for item in await hget_all_json(k_tin_operations())
                if str(item.get("tin") or "") == str(tin)
                and str(item.get("intentId") or "") == str(route.get("intentId") or "")
                and item.get("status") == "finalized"
            ),
            None,
        )
        if not finalized_operation:
            # Reconcile pending/stale Receiver state against the current
            # on-chain route. This is safe because the route envelope is
            # commitment-bound and is validated before persistence.
            onchain_route = await read_onchain_tin_pru_route(str(tin))
            if not onchain_route:
                return None
            route = onchain_route
            await r.hset(k_tin_pru_routes(), str(tin), json.dumps(route))
            logger.info(
                "Reconciled TIN PRU route from on-chain account: tin=%s version=%s",
                tin,
                route["routeVersion"],
            )
            return route
        route["status"] = "finalized"
        route["updatedAt"] = datetime.now(timezone.utc).isoformat()
        await r.hset(k_tin_pru_routes(), str(tin), json.dumps(route))
    prus = route.get("prus")
    if not isinstance(prus, list) or not prus:
        return None
    owner_pubkey_hash = _route_owner_pubkey_hash(route)
    if owner_pubkey_hash and route.get("ownerPubkeyHash") != owner_pubkey_hash:
        route["ownerPubkeyHash"] = owner_pubkey_hash
        await r.hset(k_tin_pru_routes(), str(tin), json.dumps(route))
    return route

def _compute_pru_spend_auth_hash(*, tin: str, pru_index: int, owner_pubkey: str) -> str:
    return hashlib.sha256(
        b"".join(
            [
                int(tin).to_bytes(8, "little", signed=False),
                int(pru_index).to_bytes(2, "little", signed=False),
                decode_base58(owner_pubkey),
                b"TRUSTLINK_PRU_SPEND_GUARD_V1",
            ]
        )
    ).hexdigest()

def _route_owner_pubkey_hash(route: dict[str, Any]) -> Optional[str]:
    owner_pubkey_hash = route.get("ownerPubkeyHash")
    if isinstance(owner_pubkey_hash, str) and owner_pubkey_hash.strip():
        return owner_pubkey_hash.strip().lower()
    legacy_owner = route.get("ownerPubkey")
    if not isinstance(legacy_owner, str) or not legacy_owner.strip():
        return None
    try:
        return hashlib.sha256(decode_base58(legacy_owner.strip())).hexdigest()
    except ValueError:
        return None

def public_tin_pru_route(route: dict[str, Any]) -> TinPruRoutePublicResponse:
    public_prus = []
    for pru in route.get("prus", []):
        if not isinstance(pru, dict):
            continue
        public_key = str(pru.get("publicKey") or "").strip()
        if not public_key:
            continue
        public_prus.append(
            TinPruPublicAddress(
                index=int(pru.get("index") or 0),
                publicKey=public_key,
                state=str(pru.get("state") or "ACTIVE"),
            )
        )
    return TinPruRoutePublicResponse(
        tin=str(route["tin"]),
        pruConfigurationHash=str(route["pruConfigurationHash"]),
        status="finalized",
        prus=public_prus,
    )

def _build_pru_route_proof_message(
    *,
    tin: str,
    purpose: str,
    owner_pubkey: str,
    nonce: str,
    timestamp: int,
    platform_read_key: Optional[str] = None,
    expiry: Optional[int] = None,
) -> bytes:
    purpose_label = {
        "pru_route_lookup": "Load TIN Balance",
        "delegate_read_access": "Delegate Balance Access",
        "revoke_read_access": "Revoke Balance Access",
    }.get(purpose, purpose)
    expires_ts = expiry or (timestamp + 300)
    expires_iso = datetime.fromtimestamp(expires_ts, tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return _build_canonical_message(
        "Balance Access",
        [
            ("TIN", tin),
            ("Purpose", purpose_label),
            ("Nonce", nonce),
            ("Expires", expires_iso),
        ],
    ).encode("utf-8")

def _build_platform_pru_route_request_message(*, tin: str, platform_read_key: str) -> bytes:
    return "\n".join(
        [
            "TrustLink TSN Platform PRU Route Request",
            "version=1",
            f"tin={tin}",
            f"platformReadKey={platform_read_key}",
        ]
    ).encode("utf-8")

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

def _decode_signed_message_base64(value: Optional[str]) -> Optional[bytes]:
    if not value:
        return None
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(403, "signed message is not valid base64") from exc

def _assert_pru_route_signed_message_matches(
    *,
    signed_message: bytes,
    tin: str,
    purpose: str,
    nonce: str,
    timestamp: int,
    expiry: Optional[int] = None,
) -> bytes:
    try:
        message_text = signed_message.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(403, "signed message is not valid UTF-8") from exc
    fields = _parse_canonical_message(message_text, "Balance Access")
    purpose_label = {
        "pru_route_lookup": "Load TIN Balance",
        "delegate_read_access": "Delegate Balance Access",
        "revoke_read_access": "Revoke Balance Access",
    }.get(purpose, purpose)
    expected_expires = datetime.fromtimestamp(
        expiry or (timestamp + 300),
        tz=timezone.utc,
    ).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    if fields.get("TIN") != str(tin):
        raise HTTPException(403, "signed message TIN does not match the request")
    if fields.get("Purpose") != purpose_label:
        raise HTTPException(403, "signed message purpose does not match the request")
    if fields.get("Nonce") != nonce:
        raise HTTPException(403, "signed message nonce does not match the request")
    if fields.get("Expires") != expected_expires:
        raise HTTPException(403, "signed message expiry does not match the request")
    return signed_message

async def _read_onchain_tin_owner_hash(*, tin: str, owner_pubkey: str) -> Optional[str]:
    identity_pubkey = get_tins_identity_pda(owner_pubkey)
    data = await read_tins_account_data(identity_pubkey)
    if data:
        try:
            decoded = decode_tin_account_header(data)
            if str(decoded.get("tin")) == str(tin):
                return str(decoded.get("ownerPubkeyHash") or "").lower()
        except ValueError:
            pass
    return await find_tins_owner_hash_by_tin(tin)

def _accepted_onchain_owner_markers(owner_pubkey: str) -> set[str]:
    owner_pubkey_bytes = decode_base58(owner_pubkey)
    return {
        hashlib.sha256(owner_pubkey_bytes).hexdigest(),
        owner_pubkey_bytes.hex(),
        bytes(get_tins_identity_pda(owner_pubkey)).hex(),
    }

async def _assert_owner_controls_tin(
    *,
    tin: str,
    owner_pubkey: str,
    accepted_owner_hash: Optional[str] = None,
) -> str:
    owner_hash = hashlib.sha256(decode_base58(owner_pubkey)).hexdigest()
    accepted_onchain_markers = _accepted_onchain_owner_markers(owner_pubkey)
    onchain_hash = await _read_onchain_tin_owner_hash(tin=tin, owner_pubkey=owner_pubkey)
    if accepted_owner_hash == owner_hash:
        if onchain_hash and onchain_hash not in accepted_onchain_markers:
            logger.warning(
                "PRU route owner proof rejected: tin=%s ownerHash=%s routeHash=%s onchainHash=%s",
                tin,
                owner_hash[:12],
                str(accepted_owner_hash)[:12],
                onchain_hash[:12],
            )
            raise HTTPException(403, "owner_pubkey does not match the on-chain TIN owner commitment")
        return owner_hash
    if not onchain_hash:
        logger.warning(
            "PRU route owner proof rejected: tin=%s ownerHash=%s reason=missing-onchain-owner",
            tin,
            owner_hash[:12],
        )
        raise HTTPException(403, "TIN owner account was not found on-chain")
    if onchain_hash not in accepted_onchain_markers and accepted_owner_hash != owner_hash:
        logger.warning(
            "PRU route owner proof rejected: tin=%s ownerHash=%s routeHash=%s onchainHash=%s",
            tin,
            owner_hash[:12],
            str(accepted_owner_hash or "")[:12],
            onchain_hash[:12],
        )
        raise HTTPException(403, "owner_pubkey does not match the on-chain TIN owner commitment")
    return owner_hash

async def _assert_pru_route_nonce_unused(*, purpose: str, tin: str, owner_pubkey: str, nonce: str) -> None:
    now = int(time.time())
    nonce_key = hashlib.sha256(f"{purpose}|{tin}|{owner_pubkey}|{nonce}".encode("utf-8")).hexdigest()
    consumed = await (await get_mempool_store()).consume_once(
        k_tin_pru_route_nonces(),
        nonce_key,
        json.dumps(
            {
                "tin": tin,
                "ownerPubkey": owner_pubkey,
                "purpose": purpose,
                "expiresAt": now + 300,
            },
            separators=(",", ":"),
        ),
    )
    if not consumed:
        raise HTTPException(403, "nonce has already been used")

async def _verify_owner_pru_route_proof(
    *,
    tin: str,
    owner_pubkey: str,
    signature: str,
    nonce: str,
    timestamp: int,
    purpose: str,
    platform_read_key: Optional[str] = None,
    expiry: Optional[int] = None,
    accepted_owner_hash: Optional[str] = None,
    signed_message_base64: Optional[str] = None,
) -> str:
    now = int(time.time())
    if abs(now - int(timestamp)) > 60:
        raise HTTPException(403, "authorization timestamp is outside the allowed window")
    await _assert_pru_route_nonce_unused(purpose=purpose, tin=tin, owner_pubkey=owner_pubkey, nonce=nonce)
    owner_hash = await _assert_owner_controls_tin(
        tin=tin,
        owner_pubkey=owner_pubkey,
        accepted_owner_hash=accepted_owner_hash,
    )
    provided_signed_message = _decode_signed_message_base64(signed_message_base64)
    message = (
        _assert_pru_route_signed_message_matches(
            signed_message=provided_signed_message,
            tin=tin,
            purpose=purpose,
            nonce=nonce,
            timestamp=timestamp,
            expiry=expiry,
        )
        if provided_signed_message is not None
        else _build_pru_route_proof_message(
            tin=tin,
            purpose=purpose,
            owner_pubkey=owner_pubkey,
            nonce=nonce,
            timestamp=timestamp,
            platform_read_key=platform_read_key,
            expiry=expiry,
        )
    )
    _verify_ed25519_signature(public_key=owner_pubkey, message=message, signature_base64=signature)
    return owner_hash

async def _create_pru_route_session(*, tin: str, owner_hash: str) -> TinPruRouteSessionResponse:
    token = secrets.token_urlsafe(32)
    expires_at = int(time.time()) + 24 * 60 * 60
    r = await get_mempool_store()
    await r.hset(
        k_tin_pru_route_sessions(),
        token,
        json.dumps({"tin": tin, "ownerPubkeyHash": owner_hash, "expiresAt": expires_at}),
    )
    return TinPruRouteSessionResponse(token=token, expiresAt=expires_at, tin=tin)

async def _read_pru_route_session(token: str) -> Optional[dict[str, Any]]:
    raw = await (await get_mempool_store()).hget(k_tin_pru_route_sessions(), token)
    if not raw:
        return None
    try:
        session = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if int(session.get("expiresAt") or 0) <= int(time.time()):
        return None
    return session

def _bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    prefix = "Bearer "
    return authorization[len(prefix):].strip() if authorization.startswith(prefix) else authorization.strip()

def _delegation_key(tin: str, platform_read_key: str) -> str:
    return hashlib.sha256(f"{tin}|{platform_read_key}".encode("utf-8")).hexdigest()

async def _read_active_delegation(*, tin: str, platform_read_key: str) -> Optional[dict[str, Any]]:
    raw = await (await get_mempool_store()).hget(k_tin_read_delegations(), _delegation_key(tin, platform_read_key))
    if not raw:
        return None
    try:
        delegation = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if int(delegation.get("expiresAt") or 0) <= int(time.time()):
        return None
    return delegation

def select_pru_for_payment(route: dict[str, Any], intent: dict[str, Any], token_mint: str) -> dict[str, Any]:
    prus = [pru for pru in route.get("prus", []) if str(pru.get("state") or "ACTIVE") != "SWEPT"]
    if not prus:
        raise HTTPException(409, "Recipient TIN has no active PRU route")
    seed = _sha256_hex_utf8(
        "TSN_V1_ALLOCATION_SEED",
        intent.get("transferId") or intent.get("id") or intent.get("paymentId"),
        route["tin"],
        token_mint,
    )
    ranked = sorted(
        prus,
        key=lambda pru: _sha256_hex_utf8(
            "TSN_V1_PRU_WEIGHT",
            seed,
            pru.get("publicKeyHex") or pru.get("publicKey"),
            int(pru.get("index") or 0),
        ),
    )
    return ranked[0]

async def assert_tin_operation_can_enter(operation: dict[str, Any]) -> None:
    existing_owner = await read_shadow_tin_owner(str(operation["tin"]))
    if operation["intentType"] == "tin_creation" and existing_owner:
        raise HTTPException(409, "TIN already exists in mempool registry shadow")
    if operation["intentType"] == "tin_update":
        if not existing_owner:
            onchain = await verify_onchain_tin_for_shadow_import(operation)
            if not onchain:
                raise HTTPException(409, "TIN does not exist in mempool registry shadow")
            await import_shadow_tin_owner(operation, onchain)
            existing_owner = operation["ownerPubkey"]
            logger.info(
                "Imported legacy TIN into mempool registry shadow: tin=%s identity=%s",
                operation["tin"],
                onchain.get("identityPubkey"),
            )
        if existing_owner != operation["ownerPubkey"]:
            raise HTTPException(409, "owner_pubkey does not match stored TIN owner")
        existing_route = await read_tin_pru_route(str(operation["tin"]))
        if existing_route and int(
            operation.get("newRouteVersion")
            or operation.get("routeVersion")
            or 0
        ) <= int(existing_route.get("routeVersion") or 0):
            raise HTTPException(409, "route_version must advance the finalized TIN route")

    for existing in await hget_all_json(k_tin_operations()):
        if existing.get("intentId") == operation["intentId"]:
            continue
        if existing.get("ownerPubkey") == operation["ownerPubkey"] and existing.get("nonce") == operation["nonce"]:
            raise HTTPException(409, "nonce has already been used by this owner_pubkey")
        if (
            operation["intentType"] == "tin_creation"
            and existing.get("tin") == operation["tin"]
            and existing.get("status") not in TIN_OPERATION_TERMINAL_STATUSES
        ):
            raise HTTPException(409, "TIN already has an active creation intent")

    # The historical operation scan above preserves compatibility with state
    # written before atomic nonce storage existed. The consume_once call is the
    # authoritative guard for concurrent Node workers.
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

# â”€â”€ Background scheduler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async def _verify_receiver_work(work: dict[str, Any]) -> dict[str, Any]:
    kind = str(work.get("kind") or "")
    payload = work.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("Receiver work payload must be an object")
    if kind == "AUTHORIZED_FUNDING":
        request = CreateIntentRequest(**payload)
        verified_fields = await _verify_payment_authorization_from_signed_message(request)
        recipient_tin = str(verified_fields["recipientTin"] or "").strip()
        if recipient_tin and int(request.privacyVersion or 1) >= 2:
            tcap_relationship = await read_onchain_tin_tcap_relationship(recipient_tin)
            if tcap_relationship:
                raise ValueError(
                    "Recipient TIN uses the active TCap relationship; legacy PRU route selection is disabled. "
                    "Submit a ConfidentialSettlement authorization bound to the TCap relationship instead."
                )
            route = await read_tin_pru_route(recipient_tin)
            if not route:
                raise ValueError(f"Recipient TIN {recipient_tin} has no finalized PRU route")
            if str(route.get("pruConfigurationHash") or "").lower() != verified_fields["recipientRouteCommitment"]:
                raise ValueError("Recipient route commitment no longer matches the sender authorization")
            if int(route.get("routeVersion") or 0) != int(verified_fields["recipientRouteVersion"]):
                raise ValueError("Recipient route version no longer matches the sender authorization")
            eligible = [
                item for item in route["prus"]
                if str(item.get("state") or "ACTIVE") in {"PLANNED", "ACTIVE"}
            ]
            if not eligible:
                raise ValueError("Recipient route has no eligible receiving unit")
            # Selection is deterministic over the private Node view. The
            # Cranker receives neither the TIN nor the complete PRU map.
            if not TSN_ROUTE_ATTESTATION_SIGNING_KEY:
                raise ValueError("TSN Node route-attestation signer is not configured")
            expires_at = str(verified_fields["senderAuthorizationExpiresAt"])
            route_message = canonical_route_message(
                work_id=str(work["id"]), route_commitment=str(route["pruConfigurationHash"]),
                mint=str(request.tokenMintAddress), amount=canonical_route_amount(request.amount),
                expiry=expires_at, program_id=TSN_PROGRAM_ID,
            )
            route_signer = SigningKey(decode_secret_key(
                TSN_ROUTE_ATTESTATION_SIGNING_KEY,
                {32, 64},
                "TSN_ROUTE_ATTESTATION_SIGNING_KEY",
            )[:32])
            public_payload = request.model_dump()
            for private_field in (
                "recipientTin", "senderAuthorizationMessage",
                "senderAuthorizationSignature",
                "encryptedSettlementToken",
            ):
                public_payload.pop(private_field, None)
            # Keep the recipient TIN out of the durable payment record. The
            # short-lived, Node-only route binding below is the only place it
            # is retained after verification; payout resolution happens only
            # when a confirmed settlement needs its authorization.
            public_payload.update({
                "recipientRouteCommitment": verified_fields["recipientRouteCommitment"],
                "recipientRouteVersion": verified_fields["recipientRouteVersion"],
                "senderAuthorizationNonce": verified_fields["senderAuthorizationNonce"],
                "senderAuthorizationExpiresAt": verified_fields["senderAuthorizationExpiresAt"],
            })
            route_authorization = sign_route_message(route_message, route_signer)
            public_payload["routeAuthorization"] = {
                "version": 1,
                "message": route_message,
                "signatureBase64": route_authorization.signature_base64,
                "signerPublicKeyBase64": route_authorization.signer_public_key_base64,
                "routeCommitment": route["pruConfigurationHash"],
                "expiresAt": expires_at,
            }
            await write_recipient_route_binding(
                work_id=str(work["id"]),
                tin=recipient_tin,
                commitment=verified_fields["recipientRouteCommitment"],
                route_version=int(verified_fields["recipientRouteVersion"]),
                expires_at=expires_at,
            )
            return {
                "verifiedPayload": public_payload,
                "verificationType": "TSN_OPAQUE_RECIPIENT_ROUTE",
            }
        return {
            "verifiedPayload": {**request.model_dump(), **verified_fields},
            "verificationType": "TSN_AUTHORIZED_FUNDING",
        }
    if kind == "TIN_OPERATION":
        normalized = _normalize_tin_operation_input(payload)
        route = normalized.pop("_pruRoute", None)
        await assert_tin_operation_can_enter(normalized)
        return {
            "verifiedPayload": normalized,
            "hasPublicRouteEnvelope": route is not None,
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
                        "supportedKinds": ["AUTHORIZED_FUNDING", "TIN_OPERATION"],
                    })
                    leased_work.raise_for_status()
                    work = leased_work.json().get("work")
                    if not work:
                        # Queue drained. Return to the event wait; no polling.
                        logger.info("TSN Receiver verifier drained queue; sleeping")
                        break
                    try:
                        evidence = await _verify_receiver_work(work)
                        status = "VERIFIED"
                    except Exception as exc:
                        logger.warning("Receiver work rejected: id=%s reason=%s", work.get("id"), str(exc))
                        evidence = {"reason": str(exc)[:500]}
                        status = "REJECTED"
                    result = await receiver_request(client, "PATCH", "/api/internal/node/work", headers=headers, json={
                        "id": work["id"],
                        "owner": TSN_NODE_ID,
                        "expectedVersion": work["stateVersion"],
                        "status": status,
                        "evidence": evidence,
                    })
                    result.raise_for_status()
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialise the configured mempool store.
    await get_store()
    if not TSN_RECEIVER_NODE_API_KEY and not MEMPOOL_API_KEY:
        raise RuntimeError("TSN Node service credential is not configured")
    if not TSN_SETTLEMENT_AUTHORIZATION_SIGNING_KEY:
        logger.warning("TSN settlement authorization signing is disabled until its signing key is configured")
    if not TSN_ROUTE_DECRYPTION_PRIVATE_KEY:
        logger.warning(
            "TIN recipient routing is disabled until TSN_ROUTE_DECRYPTION_PRIVATE_KEY is configured"
        )
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
    intent_id = str(settlement_payload.get("intentId") or "").strip()
    if not intent_id:
        raise HTTPException(422, "Settlement does not reference a payment intent")
    intent_work = await _receiver_work_by_id(intent_id)
    if intent_work.get("kind") != "AUTHORIZED_FUNDING" or intent_work.get("status") != "CONFIRMED":
        raise HTTPException(409, "Payment intent is not confirmed for payout")
    verified = (intent_work.get("verification") or {}).get("verifiedPayload")
    if not isinstance(verified, dict):
        raise HTTPException(422, "Payment has no verified route authorization")
    token_mint_text = str(verified.get("tokenMintAddress") or "")
    if not token_mint_text:
        raise HTTPException(422, "Payment route is incomplete")
    route_binding = await read_recipient_route_binding(intent_id)
    if not route_binding:
        raise HTTPException(409, "Recipient route binding is unavailable or expired")
    if (
        str(verified.get("recipientRouteCommitment") or "").lower()
        != str(route_binding["commitment"]).lower()
        or int(verified.get("recipientRouteVersion") or 0)
        != int(route_binding["routeVersion"])
    ):
        raise HTTPException(422, "Recipient route binding does not match the verified payment")
    token_mint = Pubkey.from_string(token_mint_text)
    token_metadata = get_supported_token_metadata().get(str(token_mint))
    if not token_metadata:
        raise HTTPException(422, "Settlement token mint is not supported")
    # Payout fees are deliberately zero until their own signed policy is part
    # of the immutable authorization. A Cranker cannot choose or alter a fee.
    payout_amount = ui_amount_to_base_units(verified.get("amount"), int(token_metadata["decimals"]))
    payment_id = str(verified.get("paymentId") or intent_id)
    commitment_text = str(verified.get("commitmentHash") or "").strip().lower()
    if len(commitment_text) != 64:
        raise HTTPException(422, "Payment intent commitment hash is invalid")
    try:
        payment_id_hash = hashlib.sha256(payment_id.encode()).digest()
        commitment_hash = bytes.fromhex(commitment_text)
    except ValueError as exc:
        raise HTTPException(422, "Payment intent commitment hash is invalid") from exc
    # The raw commitment remains Node/Receiver material.  Only its second
    # digest crosses the settlement boundary and is used as the DNA seed.
    commitment_digest = hashlib.sha256(
        b"TSN_PRIVATE_COMMITMENT_DIGEST_V1" + commitment_hash
    ).digest()
    if await read_onchain_tin_tcap_relationship(str(route_binding["tin"])):
        raise HTTPException(
            409,
            "TCap TIN settlement cannot use CrankerVault/PRU payout; require a ConfidentialSettlement authorization",
        )
    route = await read_tin_pru_route(str(route_binding["tin"]))
    if not route:
        raise HTTPException(409, "Recipient TIN no longer has a finalized route")
    if (
        str(route.get("pruConfigurationHash") or "").lower()
        != str(route_binding["commitment"]).lower()
        or int(route.get("routeVersion") or 0) != int(route_binding["routeVersion"])
    ):
        raise HTTPException(409, "Recipient route changed after the sender authorization")
    selected_pru = select_pru_for_payment(route, verified, str(token_mint))
    recipient_wallet = str(selected_pru["publicKey"])
    operator = Pubkey.from_string(operator_text)
    cranker_vault = get_cranker_vault_pda(operator, token_mint)
    epoch_state = await read_epoch_state()
    epoch_id = int(epoch_state["epoch_number"])
    epoch_treasury = get_epoch_treasury_pda(epoch_id, token_mint)
    epoch_ledger = get_epoch_ledger_pda(epoch_treasury)
    slot = derive_claim_slot(payment_id_hash, payout_amount, token_mint, epoch_id, commitment_digest)
    claim_slot = get_epoch_claim_slot_pda(epoch_treasury, slot)
    nullifier = hashlib.sha256(
        PRIVATE_PAYOUT_DOMAIN + str(verified.get("paymentId") or intent_id).encode()
        + settlement_id.encode() + str(verified.get("commitmentHash") or "").encode()
    ).digest()
    lease_expiry_ts = int(lease_expires_at.timestamp())
    expires_at_ts = min(int(time.time()) + PERMIT_TTL_SECS, lease_expiry_ts)
    if expires_at_ts <= int(time.time()):
        raise HTTPException(409, "Claim lease expires before a usable permit can be issued")
    lease_hash = lease_id_hash(settlement_id)
    settlement_dna = get_settlement_dna_pda(slot)
    random_nonce = secrets.token_bytes(32)
    settlement_commitment = private_settlement_commitment(
        epoch_treasury, epoch_ledger, slot, commitment_digest, random_nonce,
        cranker_vault, Pubkey.from_string(recipient_wallet), token_mint,
        payout_amount, nullifier, lease_hash, lease_version, lease_expiry_ts,
        expires_at_ts,
    )
    permit_key = f"settlement-slot:{operator}:{slot.hex()}"
    store = await get_mempool_store()
    consumed = await store.consume_once(
        k_canonical_message_nonces(), permit_key,
        json.dumps({"settlementId": settlement_id, "operator": str(operator)}),
    )
    if not consumed:
        raise HTTPException(409, "Settlement commitment has already been authorized")
    signature = get_settlement_authorization_signing_key().sign(private_payout_permit_message(
        operator, epoch_treasury, epoch_ledger, claim_slot, slot, nullifier,
        commitment_digest, random_nonce, settlement_commitment, cranker_vault,
        Pubkey.from_string(recipient_wallet), token_mint, payout_amount, 0,
        lease_hash, lease_version, lease_expiry_ts, expires_at_ts,
    )).signature
    return {
        "kind": "TSN_PAYOUT_AUTHORIZATION", "authorizationVersion": 2,
        "authorizationSigner": settlement_authorization_signer_pubkey(),
        "authorizationSignatureBase64": base64.b64encode(signature).decode("ascii"),
        "payoutNullifier": nullifier.hex(),
        "tokenMintAddress": str(token_mint), "recipientWallet": recipient_wallet,
        "payoutAmountBaseUnits": str(payout_amount), "claimFeeAmountBaseUnits": "0",
        "settlementDna": str(settlement_dna),
        "epochTreasury": str(epoch_treasury), "epochLedger": str(epoch_ledger),
        "claimSlot": slot.hex(),
        "settlementCommitment": settlement_commitment.hex(),
        "commitmentDigest": commitment_digest.hex(),
        "randomNonce": random_nonce.hex(),
        "leaseId": settlement_id, "leaseVersion": lease_version,
        "leaseExpiresAt": str(settlement_lease.get("expiresAt")),
        "expiresAtTs": expires_at_ts,
    }


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
async def expire_stale_tin_operations() -> None:
    r = await get_mempool_store()
    now_ts = int(time.time())
    for raw in await hget_all_json(k_tin_operations()):
        if raw.get("status") in TIN_OPERATION_TERMINAL_STATUSES:
            continue
        if int(raw.get("expiry") or 0) > now_ts:
            continue
        raw["status"] = "expired"
        raw["failureReason"] = "Owner authorization expired before finalization."
        raw["updatedAt"] = datetime.now(timezone.utc).isoformat()
        await r.hset(k_tin_operations(), str(raw["intentId"]), json.dumps(raw))

@app.post("/tin-operations", response_model=PublicTinOperationRecord)
async def post_tin_operation(payload: dict[str, Any]) -> PublicTinOperationRecord:
    """Queue a TIN creation/update intent. The mempool never mutates TINS directly."""
    operation = _normalize_tin_operation_input(payload)
    pru_route = operation.pop("_pruRoute", None)
    async with _tin_operation_lock:
        r = await get_mempool_store()
        existing = await r.hget(k_tin_operations(), operation["intentId"])
        if existing:
            return public_tin_operation(json.loads(existing))
        await assert_tin_operation_can_enter(operation)
        if pru_route:
            await write_tin_pru_route(operation, pru_route)
        await r.hset(k_tin_operations(), operation["intentId"], json.dumps(operation))
    logger.info("TIN operation queued: %s type=%s tin=%s", operation["intentId"], operation["intentType"], operation["tin"])
    return public_tin_operation(operation)

@app.get("/tin-operations", response_model=list[PublicTinOperationRecord])
async def list_tin_operations(
    status: Optional[str] = Query(None),
    intent_type: Optional[str] = Query(None),
) -> list[PublicTinOperationRecord]:
    await expire_stale_tin_operations()
    items = await hget_all_json(k_tin_operations())
    if status:
        items = [item for item in items if item.get("status") == status]
    if intent_type:
        items = [item for item in items if item.get("intentType") == intent_type or item.get("intent_type") == intent_type]
    return [
        public_tin_operation(item)
        for item in sorted(items, key=lambda item: str(item.get("createdAt") or ""))
    ]

@app.get(
    "/tin-operations/verification-work",
    response_model=list[TinOperationRecord],
    dependencies=[Depends(require_worker_api_key)],
)
async def list_tin_verification_work(limit: int = Query(50, ge=1, le=500)) -> list[TinOperationRecord]:
    await expire_stale_tin_operations()
    items = [
        TinOperationRecord(**item)
        for item in await hget_all_json(k_tin_operations())
        if item.get("status") in {"pending_verification", "verifier_assigned"}
    ]
    return sorted(items, key=lambda item: item.createdAt)[:limit]

@app.get(
    "/tin-operations/fee-work",
    response_model=list[TinOperationRecord],
    dependencies=[Depends(require_worker_api_key)],
)
async def list_tin_fee_work(
    operator_pubkey: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
) -> list[TinOperationRecord]:
    await expire_stale_tin_operations()
    allow_single = os.environ.get("TSN_ALLOW_SINGLE_CRANKER_TINS") == "1"
    items = []
    for item in await hget_all_json(k_tin_operations()):
        if item.get("status") not in {"verified", "fee_pending"}:
            continue
        if operator_pubkey and item.get("verifierCranker") == operator_pubkey and not allow_single:
            continue
        items.append(TinOperationRecord(**item))
    return sorted(items, key=lambda item: item.createdAt)[:limit]

@app.get(
    "/tin-operations/registry-work",
    response_model=list[TinOperationRecord],
    dependencies=[Depends(require_worker_api_key)],
)
async def list_tin_registry_work(
    operator_pubkey: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
) -> list[TinOperationRecord]:
    await expire_stale_tin_operations()
    items = []
    for item in await hget_all_json(k_tin_operations()):
        if item.get("status") not in {"fee_committed", "submitter_assigned"}:
            continue
        if operator_pubkey and item.get("submitterCranker") and item.get("submitterCranker") != operator_pubkey:
            continue
        items.append(TinOperationRecord(**item))
    return sorted(items, key=lambda item: item.updatedAt)[:limit]

@app.get("/tin-operations/{intent_id}", response_model=PublicTinOperationRecord)
async def get_tin_operation(intent_id: str = ApiPath(...)) -> PublicTinOperationRecord:
    await expire_stale_tin_operations()
    r = await get_mempool_store()
    raw = await r.hget(k_tin_operations(), intent_id)
    if not raw:
        raise HTTPException(404, f"TIN operation {intent_id} not found")
    return public_tin_operation(json.loads(raw))

async def patch_tin_operation(intent_id: str, patch: dict[str, Any], allowed_statuses: set[str]) -> TinOperationRecord:
    r = await get_mempool_store()
    raw = await r.hget(k_tin_operations(), intent_id)
    if not raw:
        raise HTTPException(404, f"TIN operation {intent_id} not found")
    data = json.loads(raw)
    if data.get("status") not in allowed_statuses:
        raise HTTPException(409, f"TIN operation is {data.get('status')}, not ready for this transition")
    data.update(patch)
    data["updatedAt"] = datetime.now(timezone.utc).isoformat()
    await r.hset(k_tin_operations(), intent_id, json.dumps(data))
    return TinOperationRecord(**data)

@app.post(
    "/tin-operations/{intent_id}/verified",
    response_model=TinOperationRecord,
    dependencies=[Depends(require_worker_api_key)],
)
async def mark_tin_operation_verified(
    intent_id: str = ApiPath(...),
    body: TinOperationStageRequest = ...,
) -> TinOperationRecord:
    cranker = body.verifierCranker or body.crankerPubkey
    if not cranker:
        raise HTTPException(422, "verifier cranker pubkey is required")
    return await patch_tin_operation(
        intent_id,
        {"status": "verified", "verifierCranker": cranker, "failureReason": None},
        {"pending_verification", "verifier_assigned"},
    )

@app.post(
    "/tin-operations/{intent_id}/fee-committed",
    response_model=TinOperationRecord,
    dependencies=[Depends(require_worker_api_key)],
)
async def mark_tin_operation_fee_committed(
    intent_id: str = ApiPath(...),
    body: TinOperationStageRequest = ...,
) -> TinOperationRecord:
    submitter = body.submitterCranker or body.crankerPubkey
    if not submitter:
        raise HTTPException(422, "submitter cranker pubkey is required for fee commitment")
    async with _tin_operation_lock:
        r = await get_mempool_store()
        raw = await r.hget(k_tin_operations(), intent_id)
        if not raw:
            raise HTTPException(404, f"TIN operation {intent_id} not found")
        operation = json.loads(raw)
        if operation.get("status") not in {"verified", "fee_pending"}:
            raise HTTPException(409, "TIN operation must be verified before fee commitment")
        verifier = operation.get("verifierCranker")
        if verifier == submitter and os.environ.get("TSN_ALLOW_SINGLE_CRANKER_TINS") != "1":
            raise HTTPException(409, "submitter cranker must differ from verifier cranker")
        gross = _fee_amount_base_units(operation)
        active_split_bps = await read_tin_fee_config()
        split = compute_tin_fee_split(gross) if active_split_bps == TIN_FEE_SPLIT_BPS else {
            "verifier": gross * active_split_bps["verifier"] // 10_000,
            "submitter": gross * active_split_bps["submitter"] // 10_000,
            "team": gross * active_split_bps["team"] // 10_000,
            "reserve_pool": gross
            - (gross * active_split_bps["verifier"] // 10_000)
            - (gross * active_split_bps["submitter"] // 10_000)
            - (gross * active_split_bps["team"] // 10_000),
        }
        now_iso = datetime.now(timezone.utc).isoformat()
        fee_mint = operation.get("creationFeeMint") if operation.get("intentType") == "tin_creation" else operation.get("updateFeeMint")
        fee_record = {
            "intentId": intent_id,
            "feeMint": fee_mint or TIN_DEFAULT_FEE_MINT,
            "grossAmount": str(gross),
            "verifierAmount": str(split["verifier"]),
            "submitterAmount": str(split["submitter"]),
            "teamAmount": str(split["team"]),
            "reservePoolAmount": str(split["reserve_pool"]),
            "verifierPubkey": verifier,
            "submitterPubkey": submitter,
            "teamPubkey": os.environ.get("TSN_TINS_TEAM_PUBKEY") or os.environ.get("TSN_TINS_TREASURY_PUBKEY"),
            "reservePoolPubkey": os.environ.get("TSN_TINS_RESERVE_POOL_PUBKEY") or os.environ.get("TSN_TINS_BONUS_POOL_PUBKEY"),
            "feeCommitmentTx": body.feeCommitmentTx,
            "feeCommitmentHash": "",
            "status": "committed",
            "createdAt": now_iso,
            "updatedAt": now_iso,
        }
        fee_record["feeCommitmentHash"] = compute_tin_fee_commitment_hash(operation, fee_record)
        fee = TinOperationFeeRecord(**fee_record)
        operation.update(
            {
                "status": "fee_committed",
                "submitterCranker": submitter,
                "feeMetadata": fee.model_dump(),
                "updatedAt": now_iso,
            }
        )
        await r.hset(k_tin_fees(), intent_id, json.dumps(fee.model_dump()))
        await r.hset(k_tin_operations(), intent_id, json.dumps(operation))
        return TinOperationRecord(**operation)

@app.post(
    "/tin-operations/{intent_id}/submitted",
    response_model=TinOperationRecord,
    dependencies=[Depends(require_worker_api_key)],
)
async def mark_tin_operation_submitted(
    intent_id: str = ApiPath(...),
    body: TinOperationStageRequest = ...,
) -> TinOperationRecord:
    submitter = body.submitterCranker or body.crankerPubkey
    tx_sig = body.txSignature or body.onchainSignature
    if not submitter:
        raise HTTPException(422, "submitter cranker pubkey is required")
    if not tx_sig:
        raise HTTPException(422, "on-chain transaction signature is required")
    r = await get_mempool_store()
    raw = await r.hget(k_tin_operations(), intent_id)
    if not raw:
        raise HTTPException(404, f"TIN operation {intent_id} not found")
    current = json.loads(raw)
    if current.get("submitterCranker") and current.get("submitterCranker") != submitter:
        raise HTTPException(409, "registry work is assigned to a different submitter cranker")
    return await patch_tin_operation(
        intent_id,
        {
            "status": "submitted_onchain",
            "submitterCranker": submitter,
            "onchainSignatures": append_unique_signature(current.get("onchainSignatures"), tx_sig),
        },
        {"fee_committed", "submitter_assigned"},
    )

@app.post(
    "/tin-operations/{intent_id}/finalized",
    response_model=TinOperationRecord,
    dependencies=[Depends(require_worker_api_key)],
)
async def mark_tin_operation_finalized(
    intent_id: str = ApiPath(...),
    body: TinOperationStageRequest = ...,
) -> TinOperationRecord:
    patch: dict[str, Any] = {"status": "finalized"}
    tx_sig = body.txSignature or body.onchainSignature
    r = await get_mempool_store()
    raw = await r.hget(k_tin_operations(), intent_id)
    if raw and tx_sig:
        patch["onchainSignatures"] = append_unique_signature(json.loads(raw).get("onchainSignatures"), tx_sig)
    finalized = await patch_tin_operation(intent_id, patch, {"submitted_onchain"})
    await write_shadow_tin_owner(finalized.model_dump())
    await mark_tin_pru_route_finalized(finalized.model_dump())
    return finalized

@app.post(
    "/tin-operations/{intent_id}/failed",
    response_model=TinOperationRecord,
    dependencies=[Depends(require_worker_api_key)],
)
async def mark_tin_operation_failed(
    intent_id: str = ApiPath(...),
    body: TinOperationStageRequest = ...,
) -> TinOperationRecord:
    return await patch_tin_operation(
        intent_id,
        {"status": "failed", "failureReason": body.failureReason or body.reason or "TIN operation failed."},
        TIN_OPERATION_STATUSES - {"finalized"},
    )

@app.post(
    "/tin-operations/{intent_id}/rejected",
    response_model=TinOperationRecord,
    dependencies=[Depends(require_worker_api_key)],
)
async def mark_tin_operation_rejected(
    intent_id: str = ApiPath(...),
    body: TinOperationStageRequest = ...,
) -> TinOperationRecord:
    return await patch_tin_operation(
        intent_id,
        {"status": "rejected", "failureReason": body.failureReason or body.reason or "TIN operation rejected."},
        TIN_OPERATION_STATUSES - {"finalized"},
    )

@app.post("/intents", response_model=PublicMempoolIntent)
async def post_intent(req: CreateIntentRequest) -> PublicMempoolIntent:
    """Submit a payment intent. Idempotent by paymentId."""
    r = await get_mempool_store()
    existing = await r.hget(k_intents(), req.paymentId)
    if existing:
        return public_intent(json.loads(existing))
    parsed_signed_fields = await _verify_payment_authorization_from_signed_message(req)
    # A TIN destination is only executable when its receiving route has been
    # finalized.  Reject the intent before it reaches the Cranker so the
    # sender's escrow transaction is never submitted for a route that cannot
    # settle.  Wallet-to-wallet intents do not require a PRU route.
    recipient_tin = str(req.recipientTin or "").strip()
    if recipient_tin and int(req.privacyVersion or 1) >= 2:
        if await read_onchain_tin_tcap_relationship(recipient_tin):
            raise HTTPException(
                409,
                "Recipient TIN uses the active TCap relationship; legacy PRU route selection is disabled. "
                "Build a ConfidentialSettlement authorization for the TCap credit path.",
            )
        route = await read_tin_pru_route(recipient_tin)
        if not route:
            raise HTTPException(
                409,
                f"Recipient TIN {recipient_tin} has no finalized PRU route; "
                "the recipient must initialize and finalize a receiving route before payment.",
            )
        if str(route.get("pruConfigurationHash") or "").lower() != parsed_signed_fields["recipientRouteCommitment"]:
            raise HTTPException(409, "Recipient route commitment no longer matches the sender authorization")
        if int(route.get("routeVersion") or 0) != int(parsed_signed_fields["recipientRouteVersion"]):
            raise HTTPException(409, "Recipient route version no longer matches the sender authorization")
    now = datetime.now(timezone.utc).isoformat()
    data = req.model_dump()
    data.update(parsed_signed_fields)
    intent = MempoolIntent(**data, id=req.paymentId,
                           status="pending", postedAt=now, updatedAt=now)
    await r.hset(k_intents(), req.paymentId, json.dumps(intent.model_dump()))
    logger.info("Intent posted: %s", intent.id)
    return public_intent(intent)

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
    return [IntentWorkItem(intent=intent_submission_work(intent)) for intent in intents]

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
