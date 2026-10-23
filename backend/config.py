"""Central environment-based configuration (pydantic-settings)."""
from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "Voice Integrity API"
    ENVIRONMENT: str = "development"
    VERSION: str = "1.0.0"

    DATABASE_URL: str = "sqlite:///./voice_integrity.db"

    JWT_SECRET_KEY: str = Field(..., min_length=32, env="JWT_SECRET_KEY")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    # Secure deployment: HTTPS / secrets / DB isolation / logging
    HTTPS_ONLY: bool = False  # set True + TRUSTED_PROXY when behind TLS terminator
    TRUSTED_PROXIES: str = ""     # comma-separated IPs of load balancer / proxy
    SECRET_KEY_SOURCE: str = "env"  # env | vault; never commit secrets
    DB_HOST_RESTRICTION: bool = True  # bind DB / firewall to private interface

    # Logging / detection
    LOG_AUTH_ATTEMPTS: bool = True
    LOG_API_ERRORS: bool = True
    LOG_UNUSUAL_TRAFFIC: bool = True
    LOG_LEVEL: str = "INFO"

    UPLOAD_DIR: str = "./temp_audio"
    MAX_AUDIO_SIZE_MB: int = 25
    MAX_AUDIO_DURATION_SECONDS: int = 120

    SAMPLE_RATE: int = 16000
    MIN_AUDIO_DURATION_SECONDS: float = 3.0
    ANALYSIS_WINDOW_SECONDS: float = 5.0

    AI_THRESHOLD: float = 0.70
    SUSPICIOUS_THRESHOLD: float = 0.35

    RISK_LOW_MAX: int = 29
    RISK_MEDIUM_MAX: int = 59
    RISK_HIGH_MAX: int = 79

    CONTEXT_CAP: int = 22  # max context adjustment added to voice risk

    AUDIO_RETENTION_SECONDS: int = 3600

    MODEL_PATH: str = "./models/voice_detector.pt"
    MODEL_CONFIG_PATH: str = "./models/model_config.json"
    METRICS_PATH: str = "./models/metrics.json"
    MODEL_MODE: str = "real"  # real | mock

    RATE_LIMIT_LOGIN: str = "5/minute"
    RATE_LIMIT_REFRESH: str = "20/minute"
    RATE_LIMIT_PASSWORD_RESET: str = "3/hour"
    RATE_LIMIT_EMAIL_VERIFICATION: str = "5/hour"
    RATE_LIMIT_ANALYZE: str = "30/minute"
    RATE_LIMIT_CHUNK: str = "120/minute"
    RATE_LIMIT_ACCOUNT_CREATE: str = "3/hour"  # signup / account creation abuse guard

    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    WAVEFORM_POINTS: int = 1200
    CHUNK_ROLLING_WINDOW: int = 4

    # Mel defaults (must match ml training; stored in model_config.json)
    N_MELS: int = 128
    N_FFT: int = 1024
    HOP_LENGTH: int = 256
    FMAX: int = 8000

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def max_audio_bytes(self) -> int:
        return self.MAX_AUDIO_SIZE_MB * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
