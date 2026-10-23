"""Shared pytest fixtures: env (mock model, temp DB/upload), wav helpers, auth client."""
import io
import os

import pytest

os.environ.setdefault("MODEL_MODE", "mock")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_voice_integrity.db")
os.environ.setdefault("UPLOAD_DIR", "./temp_audio_test")
os.environ.setdefault("JWT_SECRET_KEY", os.environ.get("JWT_SECRET_KEY", "test-secret-key-REQUIRED-32CHARS"))

import numpy as np  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


def make_wav_bytes(sr: int = 16000, secs: float = 4.0, freq: float = 220.0) -> bytes:
    from scipy.io import wavfile
    t = np.arange(int(sr * secs)) / sr
    vib = np.sin(2 * np.pi * (freq + 6 * np.sin(2 * np.pi * 3 * t)) * t)
    data = (0.5 * vib * 32767).astype(np.int16)
    buf = io.BytesIO()
    wavfile.write(buf, sr, data)
    return buf.getvalue()


@pytest.fixture()
def client():
    from backend.database import SessionLocal, init_db
    from backend import models
    from backend.main import create_app
    from backend.utils.security import hash_password
    init_db()
    db = SessionLocal()
    try:
        for username, password, email in (
            ("demo", "secret123", "demo@example.com"),
            ("other", "other123", "other@example.com"),
        ):
            user = db.query(models.User).filter(models.User.username == username).first()
            if user is None:
                db.add(models.User(
                    username=username,
                    email=email,
                    password_hash=hash_password(password),
                    email_verified=True,
                ))
            else:
                user.email_verified = True
        db.commit()
    finally:
        db.close()
    with TestClient(create_app()) as c:
        yield c


@pytest.fixture()
def auth_headers(client):
    r = client.post("/api/auth/login", json={"username": "demo", "password": "secret123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
