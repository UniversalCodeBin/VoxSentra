import os

from tests.conftest import make_wav_bytes


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["model"] in ("loaded", "mock", "unavailable")
    assert "model_mode" in body


def test_analyze_e2e(client, auth_headers):
    wav = make_wav_bytes()
    r = client.post("/api/v1/analyze", headers=auth_headers,
                    files={"audio": ("test.wav", wav, "audio/wav")},
                    data={"caller_known": "true"})
    # file field name is `file`; try both
    if r.status_code == 422:
        r = client.post("/api/v1/analyze", headers=auth_headers,
                        files={"file": ("test.wav", wav, "audio/wav")},
                        data={"caller_known": "true"})
    assert r.status_code == 200, r.text
    body = r.json()
    for key in ("analysis_id", "prediction", "ai_probability", "final_risk_score",
                "risk_level", "recommendation", "audio"):
        assert key in body, key
    assert body["prediction"] in ("GENUINE", "SUSPICIOUS", "AI_GENERATED")
    assert 0.0 <= body["ai_probability"] <= 1.0
    # temp audio must be gone
    leftovers = [f for f in os.listdir("./temp_audio_test") if f != ".gitkeep"] if os.path.isdir("./temp_audio_test") else []
    assert leftovers == [], leftovers


def test_analyze_rejects_bad_format(client, auth_headers):
    r = client.post("/api/v1/analyze", headers=auth_headers,
                    files={"file": ("x.exe", b"junk" * 100, "application/octet-stream")})
    assert r.status_code == 400


def test_chunk_analysis(client, auth_headers):
    wav = make_wav_bytes(secs=4.0)
    r = client.post("/api/v1/analyze/chunk", headers=auth_headers,
                    files={"file": ("c.wav", wav, "audio/wav")},
                    data={"session_id": "sess1", "chunk_index": "0"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["session_id"] == "sess1"
    assert "rolling_ai_probability" in body
    assert body["risk_level"] in ("LOW", "MEDIUM", "HIGH", "CRITICAL")


def test_history_lists_own_analyses(client, auth_headers):
    wav = make_wav_bytes()
    client.post("/api/v1/analyze", headers=auth_headers,
                files={"file": ("h.wav", wav, "audio/wav")})
    r = client.get("/api/v1/history", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1
    item_id = body["items"][0]["id"]
    d = client.get(f"/api/v1/history/{item_id}", headers=auth_headers)
    assert d.status_code == 200


def test_history_ownership(client, auth_headers):
    wav = make_wav_bytes()
    r = client.post("/api/v1/analyze", headers=auth_headers,
                    files={"file": ("o.wav", wav, "audio/wav")})
    aid = r.json()["analysis_id"]
    l = client.post("/api/auth/login", json={"username": "other", "password": "other123"})
    other = {"Authorization": f"Bearer {l.json()['access_token']}"}
    d = client.get(f"/api/v1/history/{aid}", headers=other)
    assert d.status_code == 404
