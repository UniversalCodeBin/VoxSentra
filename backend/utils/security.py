"""Password hashing + JWT helpers. Uses pbkdf2_sha256 via passlib (py3.14-safe), falls back to hashlib."""
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

try:
    from passlib.context import CryptContext
    _pwd_ctx = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
    _USE_PASSLIB = True
except Exception:  # pragma: no cover
    _pwd_ctx = None
    _USE_PASSLIB = False

from jose import JWTError, jwt

from backend.config import get_settings

settings = get_settings()


def hash_password(password: str) -> str:
    if _USE_PASSLIB and _pwd_ctx is not None:
        return _pwd_ctx.hash(password)
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return f"pbkdf2$200000${salt.hex()}${dk.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        if password_hash.startswith("pbkdf2$"):
            _, iters, salt_hex, dk_hex = password_hash.split("$")
            dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iters))
            return hmac.compare_digest(dk.hex(), dk_hex)
        if _USE_PASSLIB and _pwd_ctx is not None:
            return bool(_pwd_ctx.verify(password, password_hash))
    except Exception:
        return False
    return False


import secrets


def generate_secure_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def verify_token(token: str, token_hash: str) -> bool:
    return hmac.compare_digest(hash_token(token), token_hash)


def create_access_token(subject: str, expires_minutes: Optional[int] = None) -> tuple[str, int]:
    s = get_settings()
    delta = timedelta(minutes=expires_minutes or s.ACCESS_TOKEN_EXPIRE_MINUTES)
    expires_in = int(delta.total_seconds())
    payload = {"sub": subject, "exp": datetime.now(timezone.utc) + delta}
    token = jwt.encode(payload, s.JWT_SECRET_KEY, algorithm=s.JWT_ALGORITHM)
    return token, expires_in


def decode_token(token: str) -> str:
    s = get_settings()
    try:
        payload = jwt.decode(token, s.JWT_SECRET_KEY, algorithms=[s.JWT_ALGORITHM])
        sub = payload.get("sub")
        if not sub:
            raise JWTError("missing sub")
        return str(sub)
    except JWTError as e:
        raise ValueError("Invalid token") from e
