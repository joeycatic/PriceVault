"""Symmetric encryption helpers for connector secrets."""

import base64
import hashlib
import hmac
import os

from cryptography.fernet import Fernet


def _fernet() -> Fernet:
    secret = os.environ.get("CONNECTOR_ENCRYPTION_KEY")
    if not secret:
        raise RuntimeError("CONNECTOR_ENCRYPTION_KEY must be configured")
    try:
        key = secret.encode()
        Fernet(key)
    except Exception:
        key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    return Fernet(key)


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    return _fernet().decrypt(value.encode()).decode()


def sign_webhook_payload(secret: str, timestamp: str, body: bytes) -> str:
    message = timestamp.encode() + b"." + body
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
