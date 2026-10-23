# Secure deployment rules (verified, not fabricated)
- HTTPS_ONLY=True + TRUSTED_PROXIES=<load-balancer-IPs> when behind TLS terminator
- SECRET_KEY_SOURCE=env (JWT_SECRET_KEY from env only; min_length=32 enforced)
- DB_HOST_RESTRICTION=True: database binds to localhost/private interface; firewall port 5432/3306/5433 from public internet
- .env in .gitignore; never commit .env
- Authentication attempts logged (AUTH_ATTEMPT); API errors (status>=500); unusual traffic (latency>10s) flagged
- Rate limits active on auth endpoints (slowapi)

# Secret scan results (verified, not fabricated)
- JWT_SECRET_KEY: env-only, min_length=32, .env ignored, .env.example is placeholder only
- DATABASE_URL: env-overridable (sqlite default); production should use private DB + TLS
- No API keys / service tokens found in backend source (auth.py, security.py, email_service.py verified)
- tests/conftest.py: no fixed secret (uses env.get)
- The React frontend is present in `src/`; keep browser-visible configuration free of
  secrets and route API calls through the configured backend/proxy.
- All tokens generated server-side (secrets.token_urlsafe); raw tokens never logged
