from __future__ import annotations

"""
TSN Shared Mempool — self-hosted version.

Requirements:
    npm run tsn:mempool:install

    Or directly:
    python -m pip install -r tsn-protocol/tsn-mempool-backend/requirements.txt

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
from nacl.public import Box, PrivateKey, PublicKey as Curve25519PublicKey, SealedBox
from nacl.signing import SigningKey, VerifyKey
from pydantic import BaseModel, Field
from solders.pubkey import Pubkey

load_dotenv(Path(__file__).resolve().parent / ".env")

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("tsn-mempool")

# ── Config ───────────────────────────────────────────────────────────────────
GITHUB_REPO     = "bigdreamsweb3/tsn-epoch-records"
GITHUB_API      = "https://api.github.com"
MEMPOOL_STORE   = os.environ.get("MEMPOOL_STORE", "file").strip().lower()
MEMPOOL_FILE    = Path(os.environ.get("MEMPOOL_FILE", ".mempool-store.json")).resolve()
FIREBASE_COLLECTION = os.environ.get("FIREBASE_COLLECTION", "tsn_mempool").strip()
TSN_PROGRAM_ID  = os.environ.get("TSN_PROGRAM_ID") or os.environ.get("PROGRAM_ID") or "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V"
MEMPOOL_API_KEY  = os.environ.get("MEMPOOL_API_KEY", "").strip()
TSN_ROUTE_ENCRYPTION_SECRET_KEY = (
    os.environ.get("TSN_ROUTE_ENCRYPTION_SECRET_KEY")
    or os.environ.get("TSN_CRANKER_ENCRYPTION_SECRET_KEY")
    or ""
).strip()
TSN_PERMIT_SIGNER_SECRET_KEY = os.environ.get("TSN_PERMIT_SIGNER_SECRET_KEY", "").strip()
EPOCH_HOURS     = int(os.environ.get("EPOCH_HOURS", "7"))
EPOCH_SECS      = EPOCH_HOURS * 60 * 60
VAULT_LIQUIDITY_REFRESH_SECS = max(60, int(os.environ.get("VAULT_LIQUIDITY_REFRESH_SECS", str(EPOCH_SECS))))
PORT            = int(os.environ.get("PORT", "8000"))
MEMPOOL_NS      = "tsn"
CLAIM_PROCESSING_TIMEOUT_SECS = int(os.environ.get("CLAIM_PROCESSING_TIMEOUT_SECS", "300"))
RECOVERY_LEASE_SECS = int(os.environ.get("RECOVERY_LEASE_SECS", "300"))
RECOVERY_REWARD_LAMPORTS = int(os.environ.get("RECOVERY_REWARD_LAMPORTS", "10000"))
RECOVERY_LOW_LIQUIDITY_UI = float(os.environ.get("RECOVERY_LOW_LIQUIDITY_UI", "0"))
CRANKER_HEARTBEAT_TTL_SECS = int(os.environ.get("CRANKER_HEARTBEAT_TTL_SECS", "30"))
DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
CRANKER_VAULT_ACCOUNT_SIZE = 162
CRANKER_VAULT_DISCRIMINATOR = hashlib.sha256(b"account:CrankerVault").digest()[:8]
BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_vault_liquidity_cache: Optional[dict[str, Any]] = None
_vault_liquidity_lock = asyncio.Lock()
_claim_queue_lock = asyncio.Lock()
_recovery_queue_lock = asyncio.Lock()
_tin_operation_lock = asyncio.Lock()
_tin_fee_config_cache: Optional[dict[str, Any]] = None
_tin_fee_config_cache_expires_at = 0.0


def split_rpc_url_list(value: str) -> list[str]:
    return [entry.strip().rstrip("/") for entry in re.split(r"[,\s]+", value) if entry.strip()]


def resolve_solana_rpc_url() -> str:
    urls = split_rpc_url_list(os.environ.get("TSN_SOLANA_RPC_URLS", ""))
    return urls[0] if urls else "https://api.devnet.solana.com"


TSN_SOLANA_RPC_URL = resolve_solana_rpc_url()

TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
ASSOCIATED_TOKEN_PROGRAM_ID = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
PRIVATE_PAYOUT_DOMAIN = b"TSN_PRIVATE_PAYOUT_V2"
PRIVATE_RECOVERY_DOMAIN = b"TSN_PRIVATE_RECOVERY_V2"
PRIVATE_REPLAY_REGISTRY_DISCRIMINATOR = hashlib.sha256(
    b"account:PrivateReplayRegistry"
).digest()[:8]
MEMPOOL_LEASE_DOMAIN = "TSN_MEMPOOL_LEASE_V1"
PERMIT_TTL_SECS = max(15, int(os.environ.get("TSN_PRIVATE_PERMIT_TTL_SECS", "90")))
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
TERMINAL_CLAIM_STATUSES = {
    "completed",
    "failed",
    "canceled",
    "cancelled",
    "expired",
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

def get_private_replay_registry_pda() -> Pubkey:
    return find_tsn_pda(
        b"tsn_private_replay",
        bytes(get_mother_escrow_pda()),
    )

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

def get_permit_signing_key() -> SigningKey:
    secret = decode_secret_key(
        TSN_PERMIT_SIGNER_SECRET_KEY,
        {32, 64},
        "TSN_PERMIT_SIGNER_SECRET_KEY",
    )
    return SigningKey(secret[:32])

def permit_signer_pubkey() -> str:
    return encode_base58(bytes(get_permit_signing_key().verify_key))

def require_worker_api_key(
    x_api_key: Optional[str] = Header(None, alias="x-api-key"),
) -> None:
    if MEMPOOL_API_KEY and not secrets.compare_digest(x_api_key or "", MEMPOOL_API_KEY):
        raise HTTPException(401, "Invalid TSN mempool API key")

def lease_authorization_message(
    action: Literal["payout", "recovery"],
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

def verify_lease_authorization(
    action: Literal["payout", "recovery"],
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
            TSN_ROUTE_ENCRYPTION_SECRET_KEY,
            {32},
            "TSN_ROUTE_ENCRYPTION_SECRET_KEY",
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
    payout_nullifier: bytes,
    payout_sequence: int,
    cranker_vault: Pubkey,
    recipient_token_account: Pubkey,
    token_mint: Pubkey,
    payout_amount: int,
    claim_fee_amount: int,
    expires_at_ts: int,
) -> bytes:
    return b"".join(
        [
            PRIVATE_PAYOUT_DOMAIN,
            bytes(get_program_pubkey()),
            bytes(get_mother_escrow_pda()),
            bytes(operator),
            payout_nullifier,
            struct.pack("<Q", payout_sequence),
            bytes(cranker_vault),
            bytes(recipient_token_account),
            bytes(token_mint),
            struct.pack("<Q", payout_amount),
            struct.pack("<Q", claim_fee_amount),
            struct.pack("<q", expires_at_ts),
        ]
    )

def private_recovery_permit_message(
    operator: Pubkey,
    recovery_nullifier: bytes,
    recovery_sequence: int,
    escrow_token_account: Pubkey,
    settlement_cranker_vault: Pubkey,
    settlement_vault_token_account: Pubkey,
    token_mint: Pubkey,
    recovery_amount: int,
    expires_at_ts: int,
) -> bytes:
    return b"".join(
        [
            PRIVATE_RECOVERY_DOMAIN,
            bytes(get_program_pubkey()),
            bytes(get_mother_escrow_pda()),
            bytes(operator),
            recovery_nullifier,
            struct.pack("<Q", recovery_sequence),
            bytes(escrow_token_account),
            bytes(settlement_cranker_vault),
            bytes(settlement_vault_token_account),
            bytes(token_mint),
            struct.pack("<Q", recovery_amount),
            struct.pack("<q", expires_at_ts),
        ]
    )

# ── Store helpers ─────────────────────────────────────────────────────────────
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
        if MEMPOOL_STORE == "firebase":
            _store = FirebaseStore()
        elif MEMPOOL_STORE in {"file", "local", "json"}:
            _store = FileStore()
            logger.info("Using local TSN mempool store: %s", MEMPOOL_FILE)
        else:
            raise RuntimeError("Set MEMPOOL_STORE to file or firebase.")
    return _store

async def get_mempool_store() -> Any:
    return await get_store()

def k_intents() -> str: return f"{MEMPOOL_NS}:intents"
def k_claims()  -> str: return f"{MEMPOOL_NS}:claims"
def k_proofs()  -> str: return f"{MEMPOOL_NS}:proofs"
def k_recoveries() -> str: return f"{MEMPOOL_NS}:recoveries"
def k_epoch()   -> str: return f"{MEMPOOL_NS}:epoch"
def k_crankers() -> str: return f"{MEMPOOL_NS}:crankers"
def k_tin_operations() -> str: return f"{MEMPOOL_NS}:tin_operations"
def k_tin_fees() -> str: return f"{MEMPOOL_NS}:tin_operation_fees"
def k_tin_registry_shadow() -> str: return f"{MEMPOOL_NS}:tin_registry_shadow"


async def hget_all_json(key: str) -> list:
    r = await get_mempool_store()
    raw: dict = await r.hgetall(key)
    return [json.loads(v) for v in raw.values()]


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


def is_processing_stale(claim: dict, now: datetime) -> bool:
    if claim.get("status") != "processing":
        return False
    updated_at = claim.get("updatedAt") or claim.get("postedAt")
    if not updated_at:
        return True
    return (now - parse_iso(str(updated_at))).total_seconds() >= CLAIM_PROCESSING_TIMEOUT_SECS


async def build_epoch_status() -> EpochStatus:
    r = await get_mempool_store()
    state        = await read_epoch_state()
    intent_count = await r.hlen(k_intents())
    claim_count  = await r.hlen(k_claims())
    proof_count  = await r.hlen(k_proofs())
    recovery_count = await r.hlen(k_recoveries())
    next_close   = next_close_for_state(state)
    return EpochStatus(
        epoch_number    = state["epoch_number"],
        epoch_started_at= state["started_at"],
        next_close_at   = next_close.isoformat(),
        intent_count    = int(intent_count),
        claim_count     = int(claim_count),
        proof_count     = int(proof_count),
        recovery_count  = int(recovery_count),
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

async def read_private_replay_sequences() -> tuple[int, int]:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getAccountInfo",
        "params": [
            str(get_private_replay_registry_pda()),
            {"encoding": "base64", "commitment": "confirmed"},
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.post(TSN_SOLANA_RPC_URL, json=payload)
        response.raise_for_status()
        rpc_response = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Private replay registry RPC unavailable: %s", exc)
        raise HTTPException(
            503,
            "Solana RPC is unavailable while reading the TSN replay registry",
        ) from exc
    if rpc_response.get("error"):
        logger.warning(
            "Private replay registry RPC error: %s",
            rpc_response["error"],
        )
        raise HTTPException(
            503,
            f"Solana RPC rejected replay-registry lookup: {rpc_response['error'].get('message', 'unknown error')}",
        )
    value = rpc_response.get("result", {}).get("value")
    if not value:
        raise HTTPException(
            503,
            "TSN private replay registry is not initialized; rerun tsn:private:configure",
        )
    encoded = ((value.get("data") or [None])[0])
    if not encoded:
        raise HTTPException(503, "TSN private replay registry data is unavailable")
    data = base64.b64decode(encoded)
    if len(data) < 57 or data[:8] != PRIVATE_REPLAY_REGISTRY_DISCRIMINATOR:
        raise HTTPException(503, "TSN private replay registry layout is invalid")
    return (
        int.from_bytes(data[40:48], "little"),
        int.from_bytes(data[48:56], "little"),
    )

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
        total_withdrawn_base_units = int.from_bytes(data[145:153], "little")
        total_rewards_base_units = int.from_bytes(data[153:161], "little")
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

# ── Models ────────────────────────────────────────────────────────────────────
class CreateIntentRequest(BaseModel):
    paymentId:        str           = Field(..., description="Unique payment ID")
    intentSeedHash:   str           = Field(..., description="SHA-256 hex of paymentId")
    recipientHash:    str           = Field(..., description="Hashed recipient")
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
    senderSignedSettlementTransaction: Optional[str] = Field(None, description="Sender co-signed settlement transaction for cranker sponsorship")
    senderSignedSettlementFeePayer: Optional[str] = Field(None, description="Cranker fee payer expected to complete and broadcast the settlement")
    senderSettlementMode: Optional[str] = Field(None, description="Settlement authority model")
    privacyVersion: Optional[int] = Field(None, description="TSN private settlement protocol version")
    commitmentRecord: Optional[str] = Field(None, description="Public commitment-only record PDA")
    senderTokenAccount: Optional[str] = Field(None, description="Sender token account used by the sponsored settlement")
    settlementVault: Optional[str] = Field(None, description="Per-payment vault PDA")
    settlementTokenAccount: Optional[str] = Field(None, description="Per-payment vault token account")
    settlementPaymentIntentId: Optional[str] = Field(None, description="u64 payment intent id used by the TSN vault instruction")
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
    escrowTxSig:          Optional[str] = None
    claimTxSig:           Optional[str] = None
    proofTxSig:           Optional[str] = None
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
    escrowTxSig: Optional[str] = None
    claimTxSig: Optional[str] = None
    proofTxSig: Optional[str] = None
    settlementResolution: Optional[str] = None
    settlementReason: Optional[str] = None
    postedAt: str
    updatedAt: str

class PostClaimRequest(BaseModel):
    paymentId:         str           = Field(...)
    intentId:          str           = Field(...)
    recipientHash:     str           = Field(...)
    destinationWallet: Optional[str] = Field(
        None,
        description="Legacy field. New private settlement routes remain inside the encrypted settlement token.",
    )
    autoclaim:         bool          = Field(False)
    source:            Optional[str] = Field(None)

class MempoolClaimRequest(PostClaimRequest):
    id:               str
    status:           str           = "pending"
    assignedCrankerPubkey: Optional[str] = None
    leaseExpiresAt: Optional[str] = None
    settlementReason: Optional[str] = None
    postedAt:         str
    updatedAt:        str

class ProofOfPayment(BaseModel):
    intent_id:         str           = Field(...)
    timestamp:         str           = Field(...)
    cranker_pubkey:    str           = Field(...)
    proof_tx:          str           = Field(...)
    encrypted_payload: Optional[str] = Field(None)
    transfer_id:       Optional[str] = Field(None)
    commitment_hash:   Optional[str] = Field(None)
    otdt_hash:         Optional[str] = Field(None)

class PublicProofOfPayment(BaseModel):
    intent_id: str
    timestamp: str
    proof_tx: str
    cranker_pubkey: Optional[str] = None

class RecoveryWorkItem(BaseModel):
    id: str
    paymentId: str
    transferId: str
    paymentIntentId: str
    settlementVault: str
    settlementTokenAccount: str
    tokenMintAddress: str
    settlementCrankerPubkey: str
    privacyVersion: Optional[int] = None
    amount: float
    epoch: int
    rewardLamports: int = RECOVERY_REWARD_LAMPORTS
    priorityScore: float
    status: Literal["pending", "leased", "completed", "failed", "canceled"] = "pending"
    assignedCrankerPubkey: Optional[str] = None
    leaseExpiresAt: Optional[str] = None
    recoveryTxSig: Optional[str] = None
    settlementReason: Optional[str] = None
    postedAt: str
    updatedAt: str

class PublicRecoveryWorkItem(BaseModel):
    id: str
    tokenMintAddress: str
    privacyVersion: Optional[int] = None
    amount: float
    epoch: int
    rewardLamports: int
    priorityScore: float
    status: str
    recoveryTxSig: Optional[str] = None
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
    "team": 1_000,
    "reserve_pool": 2_000,
}
TIN_DEFAULT_PRU_COUNT = 30
TIN_OWNER_INTENT_CREATE_DOMAIN_V1 = "TINS_CREATE_INTENT_V1"
TIN_OWNER_INTENT_UPDATE_DOMAIN_V1 = "TINS_UPDATE_INTENT_V1"
TIN_OWNER_INTENT_CREATE_DOMAIN_V2 = "TINS_CREATE_OWNER_INTENT_V2"
TIN_OWNER_INTENT_UPDATE_DOMAIN_V2 = "TINS_UPDATE_OWNER_INTENT_V2"
TIN_PRIVATE_METADATA_DOMAIN_V1 = "TINS_PRIVATE_METADATA_V1"
TIN_PRU_DERIVATION_TAG = "TSN_V1_TOKEN_AGNOSTIC_PRU"
TIN_PRU_CONFIGURATION_TAG = "TSN_V1_TOKEN_AGNOSTIC_PRU_CONFIGURATION"

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

class TinOperationRecord(BaseModel):
    intentId: str
    intentType: Literal["tin_creation", "tin_update"]
    tin: str
    ownerPubkey: str
    ownerSignature: str
    ownerIntentHash: str
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
    encryptedPhone: Optional[str] = None
    privacyLevel: int
    encryptedMetadataHash: str
    pruConfigurationHash: str
    creationFeeAmount: Optional[str] = None
    creationFeeMint: Optional[str] = None
    newDisplayName: Optional[str] = None
    newEncryptedPhone: Optional[str] = None
    newPrivacyLevel: Optional[int] = None
    newEncryptedMetadataHash: Optional[str] = None
    newPruConfigurationHash: Optional[str] = None
    updateFeeAmount: Optional[str] = None
    updateFeeMint: Optional[str] = None

class PublicTinOperationRecord(BaseModel):
    intentId: str
    intentType: str
    tin: str
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
    privacyLevel: int
    encryptedMetadataHash: str
    pruConfigurationHash: str

class TinOperationStageRequest(BaseModel):
    crankerPubkey: Optional[str] = None
    verifierCranker: Optional[str] = None
    submitterCranker: Optional[str] = None
    feeCommitmentTx: Optional[str] = None
    txSignature: Optional[str] = None
    onchainSignature: Optional[str] = None
    failureReason: Optional[str] = None
    reason: Optional[str] = None

class RecoveryLeaseRequest(BaseModel):
    operatorPubkey: str = Field(...)

class SignedLeasePermitRequest(BaseModel):
    operatorPubkey: str
    requestedAtTs: int
    requestSignatureBase64: str

class PrivatePayoutPermitResponse(BaseModel):
    permitSigner: str
    permitSignatureBase64: str
    payoutNullifier: str
    payoutSequence: str
    tokenMintAddress: str
    recipientWallet: str
    payoutAmountBaseUnits: str
    claimFeeAmountBaseUnits: str
    expiresAtTs: int

class PrivateRecoveryPermitResponse(BaseModel):
    permitSigner: str
    permitSignatureBase64: str
    recoveryNullifier: str
    recoverySequence: str
    escrowTokenAccount: str
    settlementCrankerPubkey: str
    tokenMintAddress: str
    recoveryAmountBaseUnits: str
    expiresAtTs: int

class RecoveryStatusRequest(BaseModel):
    operatorPubkey: str = Field(...)
    status: Literal["pending", "completed", "failed", "canceled"]
    recoveryTxSig: Optional[str] = None
    settlementReason: Optional[str] = None

class WorkItem(BaseModel):
    intent:       MempoolIntent | PublicMempoolIntent
    claimRequest: MempoolClaimRequest

class IntentWorkItem(BaseModel):
    intent: MempoolIntent

class UpdateStatusRequest(BaseModel):
    status:               str           = Field(...)
    assignedCrankerPubkey: Optional[str] = Field(None)
    escrowTxSig:          Optional[str] = Field(None)
    claimTxSig:           Optional[str] = Field(None)
    proofTxSig:           Optional[str] = Field(None)
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
    claim_count:     int
    proof_count:     int
    recovery_count:  int = 0

class EpochCloseResult(BaseModel):
    epoch_number:     int
    intents_archived: int
    claims_archived:  int
    proofs_archived:  int
    recoveries_archived: int = 0
    intents_rolled_over: int = 0
    claims_rolled_over:  int = 0
    intents_pruned:      int = 0
    claims_pruned:       int = 0
    proofs_pruned:       int = 0
    recoveries_rolled_over: int = 0
    recoveries_pruned: int = 0
    github_commit_url: str
    new_epoch_number:  int
    message:           str

class MempoolStatusRequest(BaseModel):
    action: Optional[str] = Field(default="status")

class MempoolStatusResponse(BaseModel):
    status: str = "ok"
    epoch:  EpochStatus

class IntentToClaimMetrics(BaseModel):
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
    intent_to_claim: IntentToClaimMetrics
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
    privacy_level: int,
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
                bytes([privacy_level]),
                nonce_bytes,
                _encode_signed_i64_le(expiry),
            ]
        )
    ).digest()

def _encrypt_tin_phone_payload(phone_number: str) -> str:
    secret = TSN_ROUTE_ENCRYPTION_SECRET_KEY.strip()
    if not secret:
        raise HTTPException(
            503,
            "TSN_ROUTE_ENCRYPTION_SECRET_KEY is missing; mempool cannot assemble private TIN payloads",
        )
    try:
        secret_bytes = decode_secret_key(
            secret,
            {32},
            "TSN_ROUTE_ENCRYPTION_SECRET_KEY",
        )
        sealed_box = SealedBox(PrivateKey(secret_bytes).public_key)
        ciphertext = sealed_box.encrypt(phone_number.encode("utf-8"))
    except (ValueError, TypeError, CryptoError, binascii.Error) as exc:
        raise HTTPException(503, "TSN route encryption key is invalid") from exc
    return base64.b64encode(ciphertext).decode("ascii")

def _derive_pru_configuration_hash(tin: str) -> str:
    master_seed_hex = secrets.token_hex(32)
    canonical_lines = []
    for index in range(TIN_DEFAULT_PRU_COUNT):
        derived_public_key = _sha256_hex_utf8(
            TIN_PRU_DERIVATION_TAG,
            master_seed_hex,
            tin,
            index,
        )
        canonical_lines.append(f"{tin}:{index}:{derived_public_key}:")
    canonical = "\n".join(canonical_lines)
    return _sha256_hex_utf8(TIN_PRU_CONFIGURATION_TAG, canonical)

def _build_private_tin_payload(
    *,
    intent_type: str,
    tin: str,
    owner_pubkey: str,
    display_name: str,
    phone_number: str,
    privacy_level: int,
) -> dict[str, str]:
    encrypted_phone = _encrypt_tin_phone_payload(phone_number)
    encrypted_metadata_hash = hashlib.sha256(
        b"".join(
            [
                TIN_PRIVATE_METADATA_DOMAIN_V1.encode("utf-8"),
                intent_type.encode("utf-8"),
                tin.encode("utf-8"),
                owner_pubkey.encode("utf-8"),
                display_name.encode("utf-8"),
                phone_number.encode("utf-8"),
                bytes([privacy_level]),
            ]
        )
    ).hexdigest()
    return {
        "encrypted_phone": encrypted_phone,
        "encrypted_metadata_hash": encrypted_metadata_hash,
        "pru_configuration_hash": _derive_pru_configuration_hash(tin),
    }

def _normalize_tin_operation_input(payload: dict[str, Any]) -> dict[str, Any]:
    intent_type = _require_string(payload, "intent_type", "intentType")
    if intent_type not in {"tin_creation", "tin_update"}:
        raise HTTPException(422, "intent_type must be tin_creation or tin_update")

    privacy_level = int(_field(payload, "privacy_level", "privacyLevel", default=0))
    if privacy_level not in {1, 2, 3, 4}:
        raise HTTPException(422, "privacy_level must be between 1 and 4")

    intent_id = str(_field(payload, "intent_id", "intentId", default=str(uuid4()))).strip()
    if not intent_id:
        raise HTTPException(422, "intent_id must not be empty")

    tin = _require_string(payload, "tin")
    encrypted_phone = _field(payload, "encrypted_phone", "encryptedPhone")
    if encrypted_phone is None:
        encrypted_phone = _field(payload, "new_encrypted_phone", "newEncryptedPhone")
    encrypted_phone = str(encrypted_phone or "").strip()
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
    owner_intent_hash = _require_string(payload, "owner_intent_hash", "ownerIntentHash")
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
    uses_client_assembled_payload = bool(
        encrypted_phone or encrypted_metadata_hash or pru_configuration_hash
    )
    if uses_client_assembled_payload:
        encrypted_phone_bytes = _decode_base64_blob(encrypted_phone, "encrypted_phone")
        metadata_hash_bytes = _decode_hash32(encrypted_metadata_hash, "encrypted_metadata_hash")
        configuration_hash_bytes = _decode_hash32(pru_configuration_hash, "pru_configuration_hash")
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
                    encrypted_phone_bytes,
                    bytes([privacy_level]),
                    metadata_hash_bytes,
                    configuration_hash_bytes,
                    nonce_bytes,
                    _encode_signed_i64_le(expiry),
                ]
            )
        ).digest()
    else:
        phone_number = _require_phone_number(payload, intent_type)
        expected_hash = _compute_owner_intent_hash_v2(
            intent_type=intent_type,
            owner_bytes=owner_bytes,
            tin=tin,
            display_name=display_name,
            phone_number=phone_number,
            privacy_level=privacy_level,
            nonce_bytes=nonce_bytes,
            expiry=expiry,
        )
        assembled_payload = _build_private_tin_payload(
            intent_type=intent_type,
            tin=tin,
            owner_pubkey=owner_pubkey,
            display_name=display_name,
            phone_number=phone_number,
            privacy_level=privacy_level,
        )
        encrypted_phone = assembled_payload["encrypted_phone"]
        encrypted_metadata_hash = assembled_payload["encrypted_metadata_hash"]
        pru_configuration_hash = assembled_payload["pru_configuration_hash"]
    if not secrets.compare_digest(expected_hash, intent_hash_bytes):
        raise HTTPException(422, "owner_intent_hash does not match the submitted TIN operation payload")
    try:
        VerifyKey(owner_bytes).verify(intent_hash_bytes, signature_bytes)
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
        "encryptedPhone": encrypted_phone if intent_type == "tin_creation" else None,
        "privacyLevel": privacy_level,
        "encryptedMetadataHash": encrypted_metadata_hash.lower(),
        "pruConfigurationHash": pru_configuration_hash.lower(),
        "creationFeeAmount": str(fee_amount) if intent_type == "tin_creation" else None,
        "creationFeeMint": fee_mint if intent_type == "tin_creation" else None,
        "newDisplayName": display_name if intent_type == "tin_update" else None,
        "newEncryptedPhone": encrypted_phone if intent_type == "tin_update" else None,
        "newPrivacyLevel": privacy_level if intent_type == "tin_update" else None,
        "newEncryptedMetadataHash": encrypted_metadata_hash.lower() if intent_type == "tin_update" else None,
        "newPruConfigurationHash": pru_configuration_hash.lower() if intent_type == "tin_update" else None,
        "updateFeeAmount": str(fee_amount) if intent_type == "tin_update" else None,
        "updateFeeMint": fee_mint if intent_type == "tin_update" else None,
    }
    return base

def public_tin_operation(record: TinOperationRecord | dict[str, Any]) -> PublicTinOperationRecord:
    data = record.model_dump() if isinstance(record, TinOperationRecord) else dict(record)
    data.pop("encryptedPhone", None)
    data.pop("newEncryptedPhone", None)
    data.pop("ownerSignature", None)
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

async def assert_tin_operation_can_enter(operation: dict[str, Any]) -> None:
    existing_owner = await read_shadow_tin_owner(str(operation["tin"]))
    if operation["intentType"] == "tin_creation" and existing_owner:
        raise HTTPException(409, "TIN already exists in mempool registry shadow")
    if operation["intentType"] == "tin_update":
        if not existing_owner:
            raise HTTPException(409, "TIN does not exist in mempool registry shadow")
        if existing_owner != operation["ownerPubkey"]:
            raise HTTPException(409, "owner_pubkey does not match stored TIN owner")

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

def recovery_priority(
    item: dict[str, Any],
    now: Optional[datetime] = None,
    settlement_liquidity_ui: Optional[float] = None,
) -> float:
    current = now or datetime.now(timezone.utc)
    posted_at = parse_iso(str(item["postedAt"]))
    age_hours = max(0.0, (current - posted_at).total_seconds() / 3600)
    amount = max(0.0, float(item.get("amount") or 0))
    liquidity_boost = 0.0
    if settlement_liquidity_ui is not None:
        deficit = max(0.0, RECOVERY_LOW_LIQUIDITY_UI - settlement_liquidity_ui)
        liquidity_boost = (deficit * 100.0) + (
            500.0 if settlement_liquidity_ui < RECOVERY_LOW_LIQUIDITY_UI else 0.0
        )
    return round(
        (amount * 10.0) + age_hours + liquidity_boost,
        6,
    )

def recovery_is_eligible(
    item: dict[str, Any],
    current_epoch: int,
    settlement_liquidity_ui: Optional[float],
) -> bool:
    if int(item.get("epoch") or 0) < current_epoch:
        return True
    return (
        RECOVERY_LOW_LIQUIDITY_UI > 0
        and
        settlement_liquidity_ui is not None
        and settlement_liquidity_ui < RECOVERY_LOW_LIQUIDITY_UI
    )

async def settlement_operator_liquidity() -> dict[str, float]:
    """Map operator wallets to live Cranker-vault liquidity without making recovery depend on RPC."""
    try:
        heartbeats, vaults = await asyncio.gather(
            hget_all_json(k_crankers()),
            read_public_vault_liquidity_cached(),
        )
    except Exception as exc:
        logger.warning("Recovery liquidity snapshot unavailable: %s", exc)
        return {}

    cranker_by_operator = {
        str(record["operator_pubkey"]): str(record["cranker_pubkey"])
        for record in heartbeats
        if record.get("operator_pubkey") and record.get("cranker_pubkey")
    }
    liquidity_by_cranker: dict[str, float] = {}
    for vault in vaults:
        cranker = vault.get("cranker")
        if not cranker:
            continue
        liquidity_by_cranker[str(cranker)] = (
            liquidity_by_cranker.get(str(cranker), 0.0)
            + max(0.0, float(vault.get("total_liquidity") or 0))
        )

    return {
        operator: liquidity_by_cranker.get(cranker, 0.0)
        for operator, cranker in cranker_by_operator.items()
    }

async def create_recovery_work_from_proof(
    intent: dict[str, Any],
    proof: ProofOfPayment,
) -> Optional[RecoveryWorkItem]:
    required = {
        "transferId": intent.get("transferId"),
        "settlementPaymentIntentId": intent.get("settlementPaymentIntentId"),
        "settlementVault": intent.get("settlementVault"),
        "settlementTokenAccount": intent.get("settlementTokenAccount"),
        "tokenMintAddress": intent.get("tokenMintAddress"),
    }
    missing = [name for name, value in required.items() if value in (None, "")]
    if missing:
        logger.warning(
            "Recovery work not created for intent=%s; missing=%s",
            intent.get("id"),
            ",".join(missing),
        )
        return None

    r = await get_mempool_store()
    for existing in await hget_all_json(k_recoveries()):
        if existing.get("paymentId") == intent.get("paymentId"):
            return RecoveryWorkItem(**existing)

    state = await read_epoch_state()
    now_iso = datetime.now(timezone.utc).isoformat()
    raw = {
        "id": (
            str(uuid4())
            if int(intent.get("privacyVersion") or 1) >= 2
            else str(intent["id"])
        ),
        "paymentId": str(intent["paymentId"]),
        "transferId": str(required["transferId"]),
        "paymentIntentId": str(required["settlementPaymentIntentId"]),
        "settlementVault": str(required["settlementVault"]),
        "settlementTokenAccount": str(required["settlementTokenAccount"]),
        "tokenMintAddress": str(required["tokenMintAddress"]),
        "settlementCrankerPubkey": proof.cranker_pubkey,
        "privacyVersion": int(intent.get("privacyVersion") or 1),
        "amount": float(intent.get("amount") or 0),
        "epoch": int(intent.get("settlementEpoch") or state["epoch_number"]),
        "rewardLamports": RECOVERY_REWARD_LAMPORTS,
        "priorityScore": 0.0,
        "status": "pending",
        "assignedCrankerPubkey": None,
        "leaseExpiresAt": None,
        "recoveryTxSig": None,
        "settlementReason": (
            "Settlement paid; recovery waits for epoch close unless smart "
            "recovery detects low settlement liquidity."
        ),
        "postedAt": now_iso,
        "updatedAt": now_iso,
    }
    raw["priorityScore"] = recovery_priority(raw)
    work = RecoveryWorkItem(**raw)
    await r.hset(k_recoveries(), work.id, json.dumps(work.model_dump()))
    logger.info(
        "Recovery queued: intent=%s transfer=%s settlement_cranker=%s",
        work.id,
        work.transferId,
        work.settlementCrankerPubkey,
    )
    return work

# ── GitHub archive ────────────────────────────────────────────────────────────
async def commit_epoch_to_github(
    epoch_number: int,
    intents: list, claims: list, proofs: list, recoveries: list,
    closed_at: str,
) -> str:
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
        row = token_totals.setdefault(
            mint,
            {"intent_count": 0, "total_amount": 0.0},
        )
        row["intent_count"] = int(row["intent_count"]) + 1
        row["total_amount"] = float(row["total_amount"]) + float(
            intent.get("amount") or 0
        )

    record = {
        "epoch_number": epoch_number,
        "closed_at":    closed_at,
        "privacy_model": "aggregate-only-v2",
        "summary": {
            "intent_count": len(intents),
            "claim_count":  len(claims),
            "proof_count":  len(proofs),
            "recovery_count": len(recoveries),
        },
        "intent_statuses": count_statuses(intents),
        "claim_statuses": count_statuses(claims),
        "recovery_statuses": count_statuses(recoveries),
        "token_totals": token_totals,
    }
    content_b64 = base64.b64encode(
        (json.dumps(record, indent=2) + "\n").encode()
    ).decode()
    date_str  = closed_at[:10]
    file_path = f"epochs/epoch-{epoch_number}-{date_str}.json"
    commit_msg = (
        f"epoch {epoch_number} closed at {closed_at} -- "
        f"{len(intents)} intents, {len(claims)} claims, {len(proofs)} proofs, "
        f"{len(recoveries)} recoveries"
    )
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        check = await client.get(
            f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/{file_path}",
            headers=headers,
        )
        payload: dict[str, Any] = {"message": commit_msg, "content": content_b64}
        if check.status_code == 200:
            payload["sha"] = check.json().get("sha")
        resp = await client.put(
            f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/{file_path}",
            json=payload, headers=headers,
        )
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"GitHub commit failed ({resp.status_code}): {resp.text[:400]}")
        return resp.json()["content"]["html_url"]


async def close_epoch_task() -> EpochCloseResult:
    r = await get_mempool_store()
    intents = await hget_all_json(k_intents())
    claims  = await hget_all_json(k_claims())
    proofs  = await hget_all_json(k_proofs())
    recoveries = await hget_all_json(k_recoveries())
    state   = await read_epoch_state()
    epoch_number = state["epoch_number"]
    closed_at    = datetime.now(timezone.utc).isoformat()

    logger.info(
        "Closing epoch %d: %d intents, %d claims, %d proofs, %d recoveries",
        epoch_number,
        len(intents),
        len(claims),
        len(proofs),
        len(recoveries),
    )

    commit_url = await commit_epoch_to_github(
        epoch_number, intents, claims, proofs, recoveries, closed_at
    )

    now = datetime.now(timezone.utc)
    proof_intent_ids = {proof["intent_id"] for proof in proofs}
    terminal_claim_intent_ids = {
        claim["intentId"]
        for claim in claims
        if claim.get("status") in TERMINAL_CLAIM_STATUSES
    }
    active_recovery_payment_ids = {
        str(recovery.get("paymentId") or "")
        for recovery in recoveries
        if recovery.get("status") not in ("completed", "canceled")
    }

    rollover_intents = []
    pruned_intents = []
    for intent in intents:
        status = str(intent.get("status", "pending"))
        retained_for_recovery = str(intent.get("paymentId") or intent["id"]) in active_recovery_payment_ids
        should_prune = not retained_for_recovery and (
            status in TERMINAL_INTENT_STATUSES
            or intent["id"] in proof_intent_ids
            or intent["id"] in terminal_claim_intent_ids
        )
        if should_prune:
            pruned_intents.append(intent)
        else:
            rollover_intents.append(intent)

    rollover_intent_ids = {intent["id"] for intent in rollover_intents}
    rollover_claims = []
    pruned_claims = []
    for claim in claims:
        status = str(claim.get("status", "pending"))
        if status in TERMINAL_CLAIM_STATUSES or claim.get("intentId") not in rollover_intent_ids:
            pruned_claims.append(claim)
            continue

        if is_processing_stale(claim, now):
            claim = {
                **claim,
                "status": "pending",
                "settlementReason": "Rolled over after stale processing lease.",
                "updatedAt": closed_at,
            }
        rollover_claims.append(claim)

    rollover_recoveries = []
    pruned_recoveries = []
    for recovery in recoveries:
        status = str(recovery.get("status", "pending"))
        if status in ("completed", "canceled"):
            pruned_recoveries.append(recovery)
            continue
        if status == "leased":
            recovery = {
                **recovery,
                "status": "pending",
                "assignedCrankerPubkey": None,
                "leaseExpiresAt": None,
                "settlementReason": "Recovery lease released during epoch rollover.",
                "updatedAt": closed_at,
            }
        rollover_recoveries.append(recovery)

    await r.delete(k_intents())
    await r.delete(k_claims())
    await r.delete(k_proofs())
    await r.delete(k_recoveries())
    if rollover_intents:
        await r.hset(
            k_intents(),
            mapping={intent["id"]: json.dumps(intent) for intent in rollover_intents},
        )
    if rollover_claims:
        await r.hset(
            k_claims(),
            mapping={claim["id"]: json.dumps(claim) for claim in rollover_claims},
        )
    if rollover_recoveries:
        await r.hset(
            k_recoveries(),
            mapping={
                recovery["id"]: json.dumps(recovery)
                for recovery in rollover_recoveries
            },
        )

    new_epoch = epoch_number + 1
    await r.set(k_epoch(), json.dumps({
        "epoch_number": new_epoch, "started_at": closed_at,
    }))
    return EpochCloseResult(
        epoch_number=epoch_number,
        intents_archived=len(intents), claims_archived=len(claims),
        proofs_archived=len(proofs),
        recoveries_archived=len(recoveries),
        intents_rolled_over=len(rollover_intents),
        claims_rolled_over=len(rollover_claims),
        intents_pruned=len(pruned_intents),
        claims_pruned=len(pruned_claims),
        proofs_pruned=len(proofs),
        recoveries_rolled_over=len(rollover_recoveries),
        recoveries_pruned=len(pruned_recoveries),
        github_commit_url=commit_url,
        new_epoch_number=new_epoch,
        message=(
            f"Epoch {epoch_number} archived. Epoch {new_epoch} started. "
            f"Rolled over {len(rollover_intents)} intents, {len(rollover_claims)} claims, "
            f"and {len(rollover_recoveries)} recoveries."
        ),
    )

# ── Background scheduler ──────────────────────────────────────────────────────
async def epoch_scheduler():
    while True:
        try:
            state = await read_epoch_state()
            next_close = next_close_for_state(state)
            sleep_for = max(1, int((next_close - datetime.now(timezone.utc)).total_seconds()))
            await asyncio.sleep(sleep_for)
            logger.info("Auto epoch close triggered")
            result = await close_epoch_task()
            logger.info(
                "Auto epoch closed: %s; rolled_over=%d/%d",
                result.github_commit_url,
                result.intents_rolled_over,
                result.claims_rolled_over,
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Auto epoch close failed; retrying in 60 seconds")
            await asyncio.sleep(60)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialise the configured mempool store.
    await get_store()
    if not MEMPOOL_API_KEY:
        logger.warning(
            "MEMPOOL_API_KEY is not configured; protected worker endpoints are open for local development"
        )
    if not TSN_ROUTE_ENCRYPTION_SECRET_KEY or not TSN_PERMIT_SIGNER_SECRET_KEY:
        logger.warning(
            "TSN private permit issuance is disabled until both routing and permit signer secrets are configured"
        )
    if is_epoch_due(await read_epoch_state()):
        logger.info("Epoch was overdue on startup; closing before accepting work")
        try:
            result = await close_epoch_task()
            logger.info("Startup epoch close completed: %s", result.message)
        except Exception:
            logger.exception("Startup epoch close failed; live work remains available")
    task = asyncio.create_task(epoch_scheduler())
    logger.info("TSN Mempool started on port %d (epoch every %dh)", PORT, EPOCH_HOURS)
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    if _store:
        await _store.aclose()

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="TSN Mempool",
    description=(
        "Shared off-chain settlement queue for the Transfer Settlement Network. "
        f"Epoch every {EPOCH_HOURS}h — archives to GitHub (bigdreamsweb3/tsn-epoch-records)."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# Allow frontend to call this API from any origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Root ──────────────────────────────────────────────────────────────────────
@app.post("/", response_model=MempoolStatusResponse)
async def mempool_status(request: MempoolStatusRequest) -> MempoolStatusResponse:
    """Mempool health check and current epoch info."""
    return MempoolStatusResponse(
        status="ok",
        epoch=await build_epoch_status(),
    )

# ── Intents ───────────────────────────────────────────────────────────────────
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
    async with _tin_operation_lock:
        r = await get_mempool_store()
        existing = await r.hget(k_tin_operations(), operation["intentId"])
        if existing:
            return public_tin_operation(json.loads(existing))
        await assert_tin_operation_can_enter(operation)
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
    now = datetime.now(timezone.utc).isoformat()
    intent = MempoolIntent(**req.model_dump(), id=req.paymentId,
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
    if body.escrowTxSig is not None:
        data["escrowTxSig"] = body.escrowTxSig
    if body.claimTxSig is not None:
        data["claimTxSig"] = body.claimTxSig
    if body.proofTxSig is not None:
        data["proofTxSig"] = body.proofTxSig
    if body.settlementResolution is not None:
        data["settlementResolution"] = body.settlementResolution
    if body.settlementReason is not None:
        data["settlementReason"] = body.settlementReason
    await r.hset(k_intents(), intent_id, json.dumps(data))
    return MempoolIntent(**data)

# ── Claim Requests ────────────────────────────────────────────────────────────
@app.post("/claim-requests", response_model=MempoolClaimRequest)
async def post_claim_request(req: PostClaimRequest) -> MempoolClaimRequest:
    """Post a claim request. Idempotent — returns existing active claim for intent."""
    r = await get_mempool_store()
    intent_raw = await r.hget(k_intents(), req.intentId)
    if not intent_raw:
        raise HTTPException(409, f"Intent {req.intentId} must exist before a claim request can be posted")
    intent = json.loads(intent_raw)
    if intent.get("status") not in ("pending", "escrowed", "onchain", "claimed", "processing"):
        raise HTTPException(409, f"Intent {req.intentId} is not claimable")
    for c in await hget_all_json(k_claims()):
        if c["intentId"] == req.intentId and c["status"] not in ("failed", "canceled"):
            return MempoolClaimRequest(**c)
    now = datetime.now(timezone.utc).isoformat()
    claim = MempoolClaimRequest(**req.model_dump(), id=str(uuid4()),
                                status="pending", postedAt=now, updatedAt=now)
    await r.hset(k_claims(), claim.id, json.dumps(claim.model_dump()))
    logger.info("Claim posted: %s for intent %s", claim.id, req.intentId)
    return claim

@app.get(
    "/claim-requests",
    response_model=list[MempoolClaimRequest],
    dependencies=[Depends(require_worker_api_key)],
)
async def list_claim_requests(
    intent_id: Optional[str] = Query(None),
    status:    Optional[str] = Query(None),
) -> list[MempoolClaimRequest]:
    intent_ids = {intent["id"] for intent in await hget_all_json(k_intents())}
    items = [MempoolClaimRequest(**c) for c in await hget_all_json(k_claims())]
    items = [c for c in items if c.intentId in intent_ids]
    if intent_id: items = [c for c in items if c.intentId == intent_id]
    if status:    items = [c for c in items if c.status   == status]
    return sorted(items, key=lambda c: c.postedAt)

@app.patch(
    "/claim-requests/{claim_id}/status",
    response_model=MempoolClaimRequest,
    dependencies=[Depends(require_worker_api_key)],
)
async def update_claim_status(
    claim_id: str = ApiPath(...),
    body: UpdateStatusRequest = ...,
) -> MempoolClaimRequest:
    r = await get_mempool_store()
    raw = await r.hget(k_claims(), claim_id)
    if not raw:
        raise HTTPException(404, f"Claim {claim_id} not found")
    data = json.loads(raw)
    data.update({"status": body.status, "updatedAt": datetime.now(timezone.utc).isoformat()})
    if body.settlementReason is not None:
        data["settlementReason"] = body.settlementReason
    await r.hset(k_claims(), claim_id, json.dumps(data))
    return MempoolClaimRequest(**data)

# ── Proofs of Payment ─────────────────────────────────────────────────────────
@app.post(
    "/proofs",
    response_model=ProofOfPayment,
    dependencies=[Depends(require_worker_api_key)],
)
async def post_proof(proof: ProofOfPayment) -> ProofOfPayment:
    """Cranker submits Proof of Payment. Auto-advances intent to 'executed'."""
    r = await get_mempool_store()
    await r.hset(k_proofs(), proof.intent_id, json.dumps(proof.model_dump()))
    # Auto-advance intent: claimed → executed
    raw = await r.hget(k_intents(), proof.intent_id)
    if raw:
        data = json.loads(raw)
        if data.get("status") in ("escrowed", "onchain", "claimed"):
            data["status"]    = "executed"
            data["proofTxSig"] = proof.proof_tx
            data["updatedAt"] = datetime.now(timezone.utc).isoformat()
            await r.hset(k_intents(), proof.intent_id, json.dumps(data))
            await create_recovery_work_from_proof(data, proof)
    logger.info("Proof posted: intent=%s cranker=%s", proof.intent_id, proof.cranker_pubkey)
    return proof

@app.get(
    "/proofs",
    response_model=list[PublicProofOfPayment],
    dependencies=[Depends(require_worker_api_key)],
)
async def list_proofs(
    intent_id:     Optional[str] = Query(None),
    cranker_pubkey: Optional[str] = Query(None),
) -> list[PublicProofOfPayment]:
    items = [ProofOfPayment(**p) for p in await hget_all_json(k_proofs())]
    if intent_id:     items = [p for p in items if p.intent_id     == intent_id]
    if cranker_pubkey: items = [p for p in items if p.cranker_pubkey == cranker_pubkey]
    return [
        PublicProofOfPayment(
            intent_id=item.intent_id,
            timestamp=item.timestamp,
            proof_tx=item.proof_tx,
        )
        for item in sorted(items, key=lambda p: p.timestamp)
    ]

# ── Recovery queue ────────────────────────────────────────────────────────────
@app.get(
    "/recoveries",
    response_model=list[PublicRecoveryWorkItem],
    dependencies=[Depends(require_worker_api_key)],
)
async def list_recoveries(
    status: Optional[str] = Query(None),
) -> list[PublicRecoveryWorkItem]:
    items = [RecoveryWorkItem(**item) for item in await hget_all_json(k_recoveries())]
    if status:
        items = [item for item in items if item.status == status]
    return [
        PublicRecoveryWorkItem(**item.model_dump())
        for item in sorted(items, key=lambda item: (-item.priorityScore, item.postedAt))
    ]

@app.get(
    "/recovery-work",
    response_model=list[RecoveryWorkItem | PublicRecoveryWorkItem],
    dependencies=[Depends(require_worker_api_key)],
)
async def list_recovery_work(
    operator_pubkey: str = Query(...),
    limit: int = Query(20, ge=1, le=100),
) -> list[RecoveryWorkItem | PublicRecoveryWorkItem]:
    now = datetime.now(timezone.utc)
    epoch_state = await read_epoch_state()
    current_epoch = int(epoch_state["epoch_number"])
    liquidity_by_operator = await settlement_operator_liquidity()
    available: list[RecoveryWorkItem] = []
    for raw in await hget_all_json(k_recoveries()):
        status = str(raw.get("status") or "pending")
        lease_expired = (
            status == "leased"
            and raw.get("leaseExpiresAt")
            and parse_iso(str(raw["leaseExpiresAt"])) <= now
        )
        assigned_to_operator = (
            status == "leased"
            and raw.get("assignedCrankerPubkey") == operator_pubkey
            and not lease_expired
        )
        if status != "pending" and not lease_expired and not assigned_to_operator:
            continue
        settlement_operator = str(raw.get("settlementCrankerPubkey") or "")
        settlement_liquidity = liquidity_by_operator.get(settlement_operator)
        if not recovery_is_eligible(raw, current_epoch, settlement_liquidity):
            continue
        raw["priorityScore"] = recovery_priority(
            raw,
            now,
            settlement_liquidity,
        )
        available.append(RecoveryWorkItem(**raw))
    return [
        (
            PublicRecoveryWorkItem(**item.model_dump())
            if int(item.privacyVersion or 1) >= 2
            else item
        )
        for item in sorted(
            available,
            key=lambda item: (-item.priorityScore, item.postedAt),
        )[:limit]
    ]

@app.post(
    "/recoveries/{recovery_id}/lease",
    response_model=RecoveryWorkItem,
    dependencies=[Depends(require_worker_api_key)],
)
async def claim_recovery_lease(
    recovery_id: str = ApiPath(...),
    body: RecoveryLeaseRequest = ...,
) -> RecoveryWorkItem:
    async with _recovery_queue_lock:
        r = await get_mempool_store()
        raw = await r.hget(k_recoveries(), recovery_id)
        if not raw:
            raise HTTPException(404, f"Recovery {recovery_id} not found")
        data = json.loads(raw)
        now = datetime.now(timezone.utc)
        current_epoch = int((await read_epoch_state())["epoch_number"])
        liquidity = (
            await settlement_operator_liquidity()
        ).get(str(data.get("settlementCrankerPubkey") or ""))
        if not recovery_is_eligible(data, current_epoch, liquidity):
            raise HTTPException(
                409,
                "Recovery is queued until epoch close unless smart recovery detects low liquidity",
            )
        current_status = str(data.get("status") or "pending")
        lease_expired = (
            current_status == "leased"
            and data.get("leaseExpiresAt")
            and parse_iso(str(data["leaseExpiresAt"])) <= now
        )
        if (
            current_status == "leased"
            and not lease_expired
            and data.get("assignedCrankerPubkey") != body.operatorPubkey
        ):
            raise HTTPException(409, "Recovery lease is held by another Cranker")
        if current_status in ("completed", "canceled"):
            raise HTTPException(409, f"Recovery {recovery_id} is already {current_status}")

        data.update({
            "status": "leased",
            "assignedCrankerPubkey": body.operatorPubkey,
            "leaseExpiresAt": datetime.fromtimestamp(
                now.timestamp() + RECOVERY_LEASE_SECS,
                tz=timezone.utc,
            ).isoformat(),
            "updatedAt": now.isoformat(),
            "settlementReason": "Recovery lease acquired.",
        })
        await r.hset(k_recoveries(), recovery_id, json.dumps(data))
        return RecoveryWorkItem(**data)

@app.patch(
    "/recoveries/{recovery_id}/status",
    response_model=RecoveryWorkItem,
    dependencies=[Depends(require_worker_api_key)],
)
async def update_recovery_status(
    recovery_id: str = ApiPath(...),
    body: RecoveryStatusRequest = ...,
) -> RecoveryWorkItem:
    async with _recovery_queue_lock:
        r = await get_mempool_store()
        raw = await r.hget(k_recoveries(), recovery_id)
        if not raw:
            raise HTTPException(404, f"Recovery {recovery_id} not found")
        data = json.loads(raw)
        assigned = data.get("assignedCrankerPubkey")
        if assigned and assigned != body.operatorPubkey:
            raise HTTPException(409, "Only the leased Cranker can update this recovery")
        now_iso = datetime.now(timezone.utc).isoformat()
        data.update({
            "status": body.status,
            "updatedAt": now_iso,
            "leaseExpiresAt": None if body.status != "pending" else data.get("leaseExpiresAt"),
        })
        if body.status == "pending":
            data["assignedCrankerPubkey"] = None
            data["leaseExpiresAt"] = None
        if body.recoveryTxSig is not None:
            data["recoveryTxSig"] = body.recoveryTxSig
        if body.settlementReason is not None:
            data["settlementReason"] = body.settlementReason
        await r.hset(k_recoveries(), recovery_id, json.dumps(data))
        return RecoveryWorkItem(**data)

# ── Work queue ────────────────────────────────────────────────────────────────
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

@app.get(
    "/work",
    response_model=list[WorkItem],
    dependencies=[Depends(require_worker_api_key)],
)
async def list_pending_work(
    limit: int = Query(50, ge=1, le=500)
) -> list[WorkItem]:
    """Claim execution work. Intents must already be escrowed by a cranker-sponsored transaction."""
    intents = await hget_all_json(k_intents())
    claims  = await hget_all_json(k_claims())
    intent_map = {i["id"]: i for i in intents}
    pending = sorted(
        [c for c in claims if c["status"] == "pending"],
        key=lambda c: c["postedAt"],
    )[:limit]
    result = []
    for c in pending:
        intent = intent_map.get(c["intentId"])
        if intent and intent["status"] in ("escrowed", "onchain", "claimed"):
            result.append(WorkItem(
                intent=(
                    public_intent(intent)
                    if int(intent.get("privacyVersion") or 1) >= 2
                    else MempoolIntent(**intent)
                ),
                claimRequest=MempoolClaimRequest(**c),
            ))
    return result

# ── Epoch management ──────────────────────────────────────────────────────────

@app.post(
    "/work/{claim_id}/lease-permit",
    response_model=PrivatePayoutPermitResponse,
    dependencies=[Depends(require_worker_api_key)],
)
async def issue_private_payout_permit(
    claim_id: str = ApiPath(...),
    body: SignedLeasePermitRequest = ...,
) -> PrivatePayoutPermitResponse:
    operator = verify_lease_authorization(
        "payout",
        claim_id,
        body.operatorPubkey,
        body.requestedAtTs,
        body.requestSignatureBase64,
    )
    async with _claim_queue_lock:
        r = await get_mempool_store()
        claim_raw = await r.hget(k_claims(), claim_id)
        if not claim_raw:
            raise HTTPException(404, f"Claim {claim_id} not found")
        claim = json.loads(claim_raw)
        intent_raw = await r.hget(k_intents(), str(claim.get("intentId") or ""))
        if not intent_raw:
            raise HTTPException(404, "Claim intent was not found")
        intent = json.loads(intent_raw)
        if int(intent.get("privacyVersion") or 1) < 2:
            raise HTTPException(409, "Legacy settlement does not use private permits")
        if intent.get("status") not in ("escrowed", "onchain", "claimed"):
            raise HTTPException(409, "Intent is not ready for private payout")

        now = datetime.now(timezone.utc)
        lease_expiry = claim.get("leaseExpiresAt")
        lease_active = (
            claim.get("status") == "processing"
            and lease_expiry
            and parse_iso(str(lease_expiry)) > now
        )
        if lease_active and claim.get("assignedCrankerPubkey") != body.operatorPubkey:
            raise HTTPException(409, "Claim lease is held by another Cranker")
        if claim.get("status") in TERMINAL_CLAIM_STATUSES:
            raise HTTPException(409, f"Claim is already {claim.get('status')}")

        payload = decrypt_settlement_token(intent.get("encryptedSettlementToken") or {})
        if payload.get("paymentId") != intent.get("paymentId"):
            raise HTTPException(422, "Settlement route payment id mismatch")
        if payload.get("tokenMintAddress") != intent.get("tokenMintAddress"):
            raise HTTPException(422, "Settlement route token mint mismatch")
        if payload.get("transferId") != intent.get("transferId"):
            raise HTTPException(422, "Settlement route transfer id mismatch")

        token_mint = Pubkey.from_string(str(payload["tokenMintAddress"]))
        recipient_wallet = Pubkey.from_string(str(payload["recipientWallet"]))
        payout_amount = int(payload["recipientAmountBaseUnits"])
        claim_fee_amount = int(payload.get("claimFeeAmountBaseUnits") or 0)
        token_metadata = get_supported_token_metadata().get(str(token_mint))
        if not token_metadata:
            raise HTTPException(422, "Settlement token mint is not supported")
        expected_escrow_amount = ui_amount_to_base_units(
            intent.get("amount"),
            int(token_metadata["decimals"]),
        )
        if payout_amount + claim_fee_amount != expected_escrow_amount:
            raise HTTPException(
                422,
                "Settlement route payout and claim fee do not equal the escrowed amount",
            )
        try:
            decryption_secret = base64.b64decode(
                str(payload["decryptionSecret"]),
                validate=True,
            )
        except (KeyError, binascii.Error) as exc:
            raise HTTPException(422, "Payout route secret is invalid") from exc
        payout_nullifier = hashlib.sha256(
            PRIVATE_PAYOUT_DOMAIN + decryption_secret
        ).digest()
        payout_sequence, _ = await read_private_replay_sequences()
        for existing_claim in await hget_all_json(k_claims()):
            if existing_claim.get("id") == claim_id:
                continue
            if (
                existing_claim.get("status") == "processing"
                and str(existing_claim.get("payoutSequence") or "") == str(payout_sequence)
                and existing_claim.get("leaseExpiresAt")
                and parse_iso(str(existing_claim["leaseExpiresAt"])) > now
            ):
                raise HTTPException(
                    409,
                    "The current private payout sequence is reserved by another active lease",
                )
        cranker_vault = get_cranker_vault_pda(operator, token_mint)
        recipient_token_account = get_associated_token_address(
            recipient_wallet,
            token_mint,
        )
        expires_at_ts = int(time.time()) + PERMIT_TTL_SECS
        permit_message = private_payout_permit_message(
            operator,
            payout_nullifier,
            payout_sequence,
            cranker_vault,
            recipient_token_account,
            token_mint,
            payout_amount,
            claim_fee_amount,
            expires_at_ts,
        )
        permit_signature = get_permit_signing_key().sign(permit_message).signature

        claim.update(
            {
                "status": "processing",
                "assignedCrankerPubkey": body.operatorPubkey,
                "leaseExpiresAt": datetime.fromtimestamp(
                    now.timestamp() + CLAIM_PROCESSING_TIMEOUT_SECS,
                    tz=timezone.utc,
                ).isoformat(),
                "updatedAt": now.isoformat(),
                "settlementReason": "Private payout lease acquired.",
                "payoutSequence": str(payout_sequence),
            }
        )
        await r.hset(k_claims(), claim_id, json.dumps(claim))

        return PrivatePayoutPermitResponse(
            permitSigner=permit_signer_pubkey(),
            permitSignatureBase64=base64.b64encode(permit_signature).decode(),
            payoutNullifier=payout_nullifier.hex(),
            payoutSequence=str(payout_sequence),
            tokenMintAddress=str(token_mint),
            recipientWallet=str(recipient_wallet),
            payoutAmountBaseUnits=str(payout_amount),
            claimFeeAmountBaseUnits=str(claim_fee_amount),
            expiresAtTs=expires_at_ts,
        )

@app.post(
    "/recoveries/{recovery_id}/lease-permit",
    response_model=PrivateRecoveryPermitResponse,
    dependencies=[Depends(require_worker_api_key)],
)
async def issue_private_recovery_permit(
    recovery_id: str = ApiPath(...),
    body: SignedLeasePermitRequest = ...,
) -> PrivateRecoveryPermitResponse:
    operator = verify_lease_authorization(
        "recovery",
        recovery_id,
        body.operatorPubkey,
        body.requestedAtTs,
        body.requestSignatureBase64,
    )
    async with _recovery_queue_lock:
        r = await get_mempool_store()
        recovery_raw = await r.hget(k_recoveries(), recovery_id)
        if not recovery_raw:
            raise HTTPException(404, f"Recovery {recovery_id} not found")
        recovery = json.loads(recovery_raw)
        if int(recovery.get("privacyVersion") or 1) < 2:
            raise HTTPException(409, "Legacy recovery does not use private permits")
        intent_raw = await r.hget(
            k_intents(),
            str(recovery.get("paymentId") or ""),
        )
        if not intent_raw:
            raise HTTPException(404, "Recovery intent was not found")
        intent = json.loads(intent_raw)

        now = datetime.now(timezone.utc)
        current_epoch = int((await read_epoch_state())["epoch_number"])
        liquidity = (
            await settlement_operator_liquidity()
        ).get(str(recovery.get("settlementCrankerPubkey") or ""))
        if not recovery_is_eligible(recovery, current_epoch, liquidity):
            raise HTTPException(
                409,
                "Recovery is queued until epoch close unless smart recovery detects low liquidity",
            )
        lease_expiry = recovery.get("leaseExpiresAt")
        lease_active = (
            recovery.get("status") == "leased"
            and lease_expiry
            and parse_iso(str(lease_expiry)) > now
        )
        if lease_active and recovery.get("assignedCrankerPubkey") != body.operatorPubkey:
            raise HTTPException(409, "Recovery lease is held by another Cranker")
        if recovery.get("status") in ("completed", "canceled", "failed"):
            raise HTTPException(409, f"Recovery is already {recovery.get('status')}")

        payload = decrypt_settlement_token(intent.get("encryptedSettlementToken") or {})
        if payload.get("transferId") != recovery.get("transferId"):
            raise HTTPException(422, "Recovery route transfer id mismatch")
        if payload.get("tokenMintAddress") != recovery.get("tokenMintAddress"):
            raise HTTPException(422, "Recovery route token mint mismatch")

        token_mint = Pubkey.from_string(str(payload["tokenMintAddress"]))
        escrow_token_account = Pubkey.from_string(
            str(recovery["settlementTokenAccount"])
        )
        settlement_cranker_operator = Pubkey.from_string(
            str(recovery["settlementCrankerPubkey"])
        )
        recovery_amount = int(payload["recipientAmountBaseUnits"]) + int(
            payload.get("claimFeeAmountBaseUnits") or 0
        )
        if recovery_amount > 0xFFFF_FFFF_FFFF_FFFF:
            raise HTTPException(422, "Recovery amount is outside the u64 range")
        token_metadata = get_supported_token_metadata().get(str(token_mint))
        if not token_metadata:
            raise HTTPException(422, "Recovery token mint is not supported")
        if recovery_amount != ui_amount_to_base_units(
            intent.get("amount"),
            int(token_metadata["decimals"]),
        ):
            raise HTTPException(
                422,
                "Recovery amount does not equal the escrowed amount",
            )
        try:
            decryption_secret = base64.b64decode(
                str(payload["decryptionSecret"]),
                validate=True,
            )
        except (KeyError, binascii.Error) as exc:
            raise HTTPException(422, "Recovery route secret is invalid") from exc
        recovery_nullifier = hashlib.sha256(
            PRIVATE_RECOVERY_DOMAIN + decryption_secret
        ).digest()
        _, recovery_sequence = await read_private_replay_sequences()
        for existing_recovery in await hget_all_json(k_recoveries()):
            if existing_recovery.get("id") == recovery_id:
                continue
            if (
                existing_recovery.get("status") == "leased"
                and str(existing_recovery.get("recoverySequence") or "") == str(recovery_sequence)
                and existing_recovery.get("leaseExpiresAt")
                and parse_iso(str(existing_recovery["leaseExpiresAt"])) > now
            ):
                raise HTTPException(
                    409,
                    "The current private recovery sequence is reserved by another active lease",
                )
        settlement_cranker_vault = get_cranker_vault_pda(
            settlement_cranker_operator,
            token_mint,
        )
        settlement_vault_token_account = get_cranker_vault_token_pda(
            settlement_cranker_vault
        )
        expires_at_ts = int(time.time()) + PERMIT_TTL_SECS
        permit_message = private_recovery_permit_message(
            operator,
            recovery_nullifier,
            recovery_sequence,
            escrow_token_account,
            settlement_cranker_vault,
            settlement_vault_token_account,
            token_mint,
            recovery_amount,
            expires_at_ts,
        )
        permit_signature = get_permit_signing_key().sign(permit_message).signature

        recovery.update(
            {
                "status": "leased",
                "assignedCrankerPubkey": body.operatorPubkey,
                "leaseExpiresAt": datetime.fromtimestamp(
                    now.timestamp() + RECOVERY_LEASE_SECS,
                    tz=timezone.utc,
                ).isoformat(),
                "updatedAt": now.isoformat(),
                "settlementReason": "Private recovery lease acquired.",
                "recoverySequence": str(recovery_sequence),
            }
        )
        await r.hset(k_recoveries(), recovery_id, json.dumps(recovery))

        return PrivateRecoveryPermitResponse(
            permitSigner=permit_signer_pubkey(),
            permitSignatureBase64=base64.b64encode(permit_signature).decode(),
            recoveryNullifier=recovery_nullifier.hex(),
            recoverySequence=str(recovery_sequence),
            escrowTokenAccount=str(escrow_token_account),
            settlementCrankerPubkey=str(settlement_cranker_operator),
            tokenMintAddress=str(token_mint),
            recoveryAmountBaseUnits=str(recovery_amount),
            expiresAtTs=expires_at_ts,
        )

@app.get("/metrics", response_model=MetricsResponse)
async def get_metrics() -> MetricsResponse:
    intents = await hget_all_json(k_intents())
    claims = await hget_all_json(k_claims())
    claims_by_payment = {claim["paymentId"]: claim for claim in claims if claim.get("paymentId")}
    samples: list[float] = []
    latest: Optional[str] = None
    for intent in intents:
        claim = claims_by_payment.get(intent.get("paymentId"))
        if not claim:
            continue
        try:
            intent_time = parse_iso(intent["postedAt"])
            claim_time = parse_iso(claim["postedAt"])
        except (KeyError, ValueError):
            continue
        samples.append(max(0, (claim_time - intent_time).total_seconds() * 1000))
        latest = claim.get("postedAt") or latest

    uptime_seconds = int((datetime.now(timezone.utc) - SERVICE_STARTED_AT).total_seconds())
    crankers = {
        proof["cranker_pubkey"]
        for proof in await hget_all_json(k_proofs())
        if proof.get("cranker_pubkey")
    }
    return MetricsResponse(
        intent_to_claim=IntentToClaimMetrics(
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
    proofs = await hget_all_json(k_proofs())
    proof_crankers = {
        proof["cranker_pubkey"]
        for proof in proofs
        if proof.get("cranker_pubkey")
    }
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
    total_seen = proof_crankers.union({
        record.get("operator_pubkey")
        for record in heartbeat_records
        if record.get("operator_pubkey")
    })

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
        elif status in ("pending", "claimed", "processing"):
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

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=False)
