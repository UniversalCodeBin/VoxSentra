"""Privacy: temp audio deleted after success AND after failure."""
import os

from tests.conftest import make_wav_bytes


def _leftovers():
    d = "./temp_audio_test"
    if not os.path.isdir(d):
        return []
    return sorted(f for f in os.listdir(d) if f != ".gitkeep")


def test_temp_deleted_after_success(client, auth_headers):
    before = set(_leftovers())
    wav = make_wav_bytes()
    r = client.post("/api/v1/analyze", headers=auth_headers,
                    files={"file": ("p.wav", wav, "audio/wav")})
    assert r.status_code == 200, r.text
    assert set(_leftovers()) == before


def test_temp_deleted_after_failure(client, auth_headers):
    before = set(_leftovers())
    r = client.post("/api/v1/analyze", headers=auth_headers,
                    files={"file": ("bad.wav", b"garbage" * 500, "audio/wav")})
    assert r.status_code in (400, 422, 503)
    assert set(_leftovers()) == before


def test_no_raw_audio_column():
    from backend.models import Analysis
    cols = [c.name for c in Analysis.__table__.columns]
    assert "audio" not in cols and "waveform_data" not in cols and "raw_audio" not in cols
    assert "feature_summary" in cols
