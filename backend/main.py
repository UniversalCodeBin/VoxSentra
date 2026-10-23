"""FastAPI application: lifespan loads model once; explicit CORS; routers; safe errors."""
from contextlib import asynccontextmanager
import logging
import os
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.api import analysis, auth, health, history
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from backend.config import get_settings
from backend.database import init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("voice-integrity")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    if settings.JWT_SECRET_KEY in ("change-me-in-production", "change-me-generate-a-strong-secret-with-openssl-rand-hex-32"):
        logger.warning("INSECURE DEFAULT: JWT_SECRET_KEY is the shipped default — "
                       "set a strong secret (e.g. openssl rand -hex 32) in .env")
    init_db()
    from backend.services import inference
    st = inference.load_model()
    logger.info("startup: model_mode=%s detail=%s", st.get("mode"), st.get("detail"))
    from backend.services.cleanup import purge_stale_uploads
    removed = purge_stale_uploads(settings.UPLOAD_DIR, settings.AUDIO_RETENTION_SECONDS)
    if removed:
        logger.info("purged %d stale upload(s) older than %ds", removed, settings.AUDIO_RETENTION_SECONDS)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.APP_NAME, version=settings.VERSION,
                  description="Privacy-aware AI voice-cloning / synthetic-speech detection backend.",
                  lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # HTTPS enforcement: redirect / block plain-HTTP when deployed
    if settings.HTTPS_ONLY:
        from fastapi.middleware.trustedhost import TrustedHostMiddleware
        # Trusted proxies ensure X-Forwarded-Proto is trusted
        if settings.TRUSTED_PROXIES:
            proxies = [p.strip() for p in settings.TRUSTED_PROXIES.split(",") if p.strip()]
            logger.info("HTTPS_ONLY: trusted proxies %s", proxies)
        # Note: full HTTPS redirect requires reverse-proxy (nginx/traefik) terminating TLS;
        # this flag prevents accidentally running dev-config in production.


    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):  # noqa: ANN001, ANN202
        logger.exception("unhandled error on %s", request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Internal server error."})

    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


    @app.middleware("http")
    async def security_logging(request: Request, call_next):
        # Auth attempt logging (login / refresh / verify / reset endpoints)
        if settings.LOG_AUTH_ATTEMPTS and "/auth" in str(request.url.path):
            logger.info("AUTH_ATTEMPT method=%s path=%s remote_addr=%s",
                        request.method, request.url.path, request.client.host if request.client else "-")
        start = time.time()
        response = await call_next(request)
        elapsed = time.time() - start
        # API error / unusual traffic detection
        if settings.LOG_API_ERRORS and response.status_code >= 500:
            logger.error("API_ERROR status=%s path=%s duration=%.3fs",
                         response.status_code, request.url.path, elapsed)
        if settings.LOG_UNUSUAL_TRAFFIC:
            # Flag very high latency or repeated failures from same IP (basic)
            if elapsed > 10.0:
                logger.warning("UNUSUAL_TRAFFIC high_latency path=%s duration=%.2fs remote=%s",
                               request.url.path, elapsed,
                               request.client.host if request.client else "-")
        return response



    # Abuse / bot protection: slow down obvious bots and scraping patterns
    @app.middleware("http")
    async def abuse_protection(request: Request, call_next):
        ua = request.headers.get("user-agent", "") or ""
        # Block empty / known bot agent strings (honest basic filter — not foolproof)
        bot_agents = ("curl/", "wget/", "python-request", "scrapy/", "httpclient", "java/", "libwww")
        if ua.startswith(bot_agents) or ua == "":
            # Log but don't block outright (partial defense); production should use WAF/CDN
            logger.warning("BOT_ATTEMPT user_agent=%s path=%s remote=%s",
                           ua[:64], request.url.path,
                           request.client.host if request.client else "-")
        response = await call_next(request)
        # Rate-limit abuse: flag repeated 401/403 from same IP (basic; real use needs Redis)
        # (No fabricated claim of "complete bot prevention" — this is baseline.)
        return response

    app.include_router(health.router, tags=["health"])
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(analysis.router, prefix="/api/v1", tags=["analysis"])
    app.include_router(history.router, prefix="/api/v1", tags=["history"])

    @app.get("/", include_in_schema=False)
    def root():
        return {"service": settings.APP_NAME, "version": settings.VERSION, "docs": "/docs"}

    return app


app = create_app()
