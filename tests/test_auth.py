def test_valid_login(client):
    r = client.post("/api/auth/login", json={"username": "demo", "password": "secret123"})
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]


def test_invalid_password_401(client):
    r = client.post("/api/auth/login", json={"username": "demo", "password": "wrong"})
    assert r.status_code == 401


def test_missing_token_401(client):
    r = client.get("/api/v1/history")
    assert r.status_code == 401


def test_invalid_token_401(client):
    r = client.get("/api/v1/history", headers={"Authorization": "Bearer junk"})
    assert r.status_code == 401


def test_protected_analyze_requires_auth(client):
    r = client.post("/api/v1/analyze")
    assert r.status_code in (401, 422)
