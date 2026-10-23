"""Pydantic request/response schemas (frontend contract)."""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator
from backend.utils.validators import sanitize_string

# ---------- Auth ----------

class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    @field_validator('username')
    @classmethod
    def _val_username(cls, v): return sanitize_string(v, 64)
    password: str = Field(min_length=1, max_length=256)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=1)


class ResendVerificationRequest(BaseModel):
    identifier: str = Field(min_length=1)


class ForgotPasswordRequest(BaseModel):
    identifier: str = Field(min_length=1)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=256)


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


# ---------- Context ----------

class FraudContext(BaseModel):
    caller_known: bool = True
    urgent_request: bool = False
    sensitive_action: bool = False
    high_value_transaction: bool = False


# ---------- Analysis ----------

class SupportingIndicators(BaseModel):
    spectral_anomaly: float = 0.0
    mfcc_pattern: float = 0.0
    pitch_consistency: float = 0.0
    prosody_anomaly: float = 0.0
    energy_variation: float = 0.0
    pause_pattern: float = 0.0


class AudioMeta(BaseModel):
    duration_seconds: float
    sample_rate: int


class ProcessingMeta(BaseModel):
    duration_seconds: Optional[float] = None
    processing_time_ms: Optional[int] = None
    inference_time_ms: Optional[int] = None
    model_mode: Optional[str] = None


class AnalysisResponse(BaseModel):
    analysis_id: int
    prediction: str  # GENUINE | SUSPICIOUS | AI_GENERATED
    classification: str  # human readable
    ai_probability: float
    genuine_probability: float
    confidence: float
    segment_count: int = 1
    segment_probabilities: list[float] = []
    voice_risk: float
    context_risk_adjustment: float
    final_risk_score: float
    risk_level: str
    replay_indicator: bool
    replay_confidence: float = 0.0
    supporting_indicators: SupportingIndicators
    recommendation: str
    audio: AudioMeta
    waveform: Optional[dict[str, Any]] = None
    spectrogram: Optional[dict[str, Any]] = None
    processing: Optional[ProcessingMeta] = None
    created_at: datetime


class ChunkAnalysisResponse(BaseModel):
    session_id: str
    chunk_index: int
    ai_probability: float
    genuine_probability: float
    rolling_ai_probability: float
    voice_risk: float
    context_risk_adjustment: float
    final_risk_score: float
    risk_level: str
    classification: str
    prediction: str
    confidence: float
    replay_indicator: bool = False
    recommendation: str
    model_mode: Optional[str] = None


# ---------- History ----------

class HistoryItem(BaseModel):
    id: int
    classification: str
    prediction: Optional[str] = None
    confidence: float
    ai_probability: Optional[float] = None
    final_risk_score: float
    risk_level: str
    replay_indicator: bool
    created_at: datetime


class HistoryListResponse(BaseModel):
    items: list[HistoryItem]
    total: int
    page: int
    page_size: int


class HistoryDetailResponse(BaseModel):
    id: int
    filename: str
    classification: str
    prediction: Optional[str] = None
    ai_probability: float
    genuine_probability: float
    confidence: float
    voice_risk: float
    context_risk: float
    final_risk: float
    risk_level: str
    replay_indicator: bool
    feature_summary: dict[str, Any] = {}
    created_at: datetime


# ---------- Health ----------

class HealthResponse(BaseModel):
    status: str
    service: str
    database: str
    model: str
    model_mode: str
    version: str
