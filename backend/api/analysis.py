"""Analysis APIs (abuse-guarded: 30/min analyze, 120/min chunk, bot middleware checks UA): full-file + short-chunk (near-real-time) analysis.

Flow per request: auth -> validate -> secure temp save -> preprocess -> features ->
inference -> replay -> risk -> recommendation -> persist metadata -> delete audio (finally).
"""
import json
import logging
import time
import uuid

import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend import models
from backend.api.auth import get_current_user
from backend.config import get_settings
from backend.database import get_db
from backend.schemas import AnalysisResponse, AudioMeta, ChunkAnalysisResponse, ProcessingMeta, SupportingIndicators
from backend.services import audio_processor as ap
from backend.services import inference as infer
from backend.services.cleanup import safe_delete
from backend.services.feature_extractor import extract_supporting_features, feature_summary_for_db, log_mel_spectrogram
from backend.services.recommendation import recommend
from backend.services.replay_detector import analyze_replay
from backend.services.risk_engine import compute_risk
from backend.utils.validators import is_allowed_extension, secure_temp_path

logger = logging.getLogger(__name__)
router = APIRouter()

_CHUNK_SESSIONS: dict[str, list[float]] = {}
_MAX_CHUNK_SESSIONS = 512  # bound in-memory rolling state
_MAX_CHUNK_HISTORY = 64


def _parse_bool(v) -> bool:
    if isinstance(v, bool):
        return v
    return str(v).lower() in ("1", "true", "yes", "on")


def _spectrogram_artifact(samples: np.ndarray) -> dict:
    """Downsampled log-mel matrix for frontend heatmap (NOT raw audio)."""
    try:
        mel = log_mel_spectrogram(samples)
        # downsample to <= 64 x 100 for payload sanity
        m = mel[:: max(1, mel.shape[0] // 64), :]
        m = m[:, :: max(1, m.shape[1] // 100)]
        flat_min, flat_max = float(m.min()), float(m.max())
        norm = ((m - flat_min) / max(flat_max - flat_min, 1e-6)).round(3).tolist()
        return {"n_mels": mel.shape[0], "frames": mel.shape[1],
                "db_min": round(flat_min, 2), "db_max": round(flat_max, 2), "data": norm}
    except Exception:
        return {}


async def _save_upload_tmp(upload: UploadFile, settings) -> str:
    data = await upload.read()
    if not data:
        raise HTTPException(status_code=400, detail="Unable to process audio file. Please upload a supported audio format.")
    if len(data) > settings.max_audio_bytes:
        raise HTTPException(status_code=413, detail=f"File too large. Maximum is {settings.MAX_AUDIO_SIZE_MB} MB.")
    if not is_allowed_extension(upload.filename or ""):
        raise HTTPException(status_code=400, detail="Unsupported audio format. Supported formats: WAV, MP3, M4A, FLAC.")
    path = secure_temp_path(settings.UPLOAD_DIR, upload.filename or "audio.wav")
    with open(path, "wb") as f:
        f.write(data)
    return path


def _friendly_error(e: Exception) -> tuple[int, str]:
    if isinstance(e, ap.UnsupportedFormatError):
        return 400, "Unsupported audio format. Supported formats: WAV, MP3, M4A, FLAC."
    if isinstance(e, ap.AudioTooShortError):
        return 400, str(e)
    if isinstance(e, ap.NoSpeechError):
        return 400, str(e)
    if isinstance(e, ap.AudioValidationError):
        return 400, str(e)
    if isinstance(e, RuntimeError) and "temporarily unavailable" in str(e):
        return 503, "Analysis temporarily unavailable. Please retry."
    return 400, "Unable to process audio file. Please upload a supported audio format."


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(file: UploadFile = File(...),
                  caller_known: bool = Form(True), urgent_request: bool = Form(False),
                  sensitive_action: bool = Form(False), high_value_transaction: bool = Form(False),
                  include_waveform: bool = Form(True), include_spectrogram: bool = Form(True),
                  db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    settings = get_settings()
    t_start = time.perf_counter()
    tmp_path = await _save_upload_tmp(file, settings)
    try:
        try:
            proc = ap.process_audio_file(tmp_path, original_filename=file.filename or "",
                                         content_type=file.content_type or "")
        except Exception as e:  # noqa: BLE001
            logger.warning("audio processing failed user=%s err=%s", user.id, e)
            code, msg = _friendly_error(e)
            raise HTTPException(status_code=code, detail=msg)
        try:
            pred = infer.predict(proc.segments)
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail="Analysis temporarily unavailable. Please retry.") from e
        indicators = extract_supporting_features(proc.samples, proc.sample_rate)
        replay = analyze_replay(proc.samples, proc.sample_rate)
        risk = compute_risk(pred["ai_probability"], caller_known=_parse_bool(caller_known),
                            urgent_request=_parse_bool(urgent_request),
                            sensitive_action=_parse_bool(sensitive_action),
                            high_value_transaction=_parse_bool(high_value_transaction),
                            replay_indicator=replay["replay_indicator"])
        rec = recommend(risk.risk_level)
        elapsed_ms = int((time.perf_counter() - t_start) * 1000)
        row = models.Analysis(
            user_id=user.id, filename=(file.filename or "upload")[:255],
            classification=risk.prediction, ai_probability=pred["ai_probability"],
            genuine_probability=pred["genuine_probability"], confidence=pred["confidence"],
            voice_risk=risk.voice_risk, context_risk=risk.context_risk_adjustment,
            final_risk=risk.final_risk_score, risk_level=risk.risk_level,
            replay_indicator=replay["replay_indicator"],
            feature_summary=json.dumps(feature_summary_for_db(indicators)))
        db.add(row)
        db.commit()
        db.refresh(row)
        logger.info("analysis id=%s user=%s ai=%.3f risk=%s total_ms=%s",
                    row.id, user.id, pred["ai_probability"], risk.final_risk_score, elapsed_ms)
        wave = None
        if _parse_bool(include_waveform):
            wave = {"sample_rate": proc.sample_rate, "duration_seconds": round(proc.duration, 2),
                    "points": len(pts := ap.waveform_points(proc.samples)), "amplitude": pts}
        spec = _spectrogram_artifact(proc.samples) if _parse_bool(include_spectrogram) else None
        return AnalysisResponse(
            analysis_id=row.id, prediction=risk.prediction, classification=risk.classification,
            ai_probability=pred["ai_probability"], genuine_probability=pred["genuine_probability"],
            confidence=pred["confidence"], segment_count=pred["segment_count"],
            segment_probabilities=pred["segment_probabilities"],
            voice_risk=risk.voice_risk, context_risk_adjustment=risk.context_risk_adjustment,
            final_risk_score=risk.final_risk_score, risk_level=risk.risk_level,
            replay_indicator=replay["replay_indicator"], replay_confidence=replay["confidence"],
            supporting_indicators=SupportingIndicators(**{k: indicators.get(k, 0.0) for k in
                ("spectral_anomaly", "mfcc_pattern", "pitch_consistency", "prosody_anomaly",
                 "energy_variation", "pause_pattern")}),
            recommendation=rec,
            audio=AudioMeta(duration_seconds=round(proc.duration, 2), sample_rate=proc.sample_rate),
            waveform=wave, spectrogram=spec,
            processing=ProcessingMeta(duration_seconds=round(proc.duration, 2),
                                      processing_time_ms=elapsed_ms,
                                      inference_time_ms=pred.get("inference_time_ms"),
                                      model_mode=infer.get_inference_state().get("mode")),
            created_at=row.created_at)
    finally:
        safe_delete(tmp_path)


@router.post("/analyze/chunk", response_model=ChunkAnalysisResponse)
async def analyze_chunk(file: UploadFile = File(...),
                        session_id: str | None = Form(None), chunk_index: int = Form(0),
                        caller_known: bool = Form(True), urgent_request: bool = Form(False),
                        sensitive_action: bool = Form(False), high_value_transaction: bool = Form(False),
                        db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    settings = get_settings()
    tmp_path = await _save_upload_tmp(file, settings)
    try:
        try:
            proc = ap.process_audio_file(tmp_path, original_filename=file.filename or "",
                                         content_type=file.content_type or "",
                                         window_seconds=settings.ANALYSIS_WINDOW_SECONDS,
                                         require_speech=False)
        except Exception as e:  # noqa: BLE001
            code, msg = _friendly_error(e)
            raise HTTPException(status_code=code, detail=msg)
        seg = proc.segments[0] if proc.segments else proc.samples
        try:
            ai_prob, _ = infer.predict_segment(np.asarray(seg, dtype=np.float32))
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail="Analysis temporarily unavailable. Please retry.") from e
        sid = session_id or uuid.uuid4().hex
        hist = _CHUNK_SESSIONS.setdefault(sid, [])
        hist.append(float(ai_prob))
        del hist[:-_MAX_CHUNK_HISTORY]
        if len(_CHUNK_SESSIONS) > _MAX_CHUNK_SESSIONS:
            for oldest in list(_CHUNK_SESSIONS)[: len(_CHUNK_SESSIONS) - _MAX_CHUNK_SESSIONS]:
                _CHUNK_SESSIONS.pop(oldest, None)
        rolling = infer.aggregate_rolling(hist, settings.CHUNK_ROLLING_WINDOW)
        replay = analyze_replay(proc.samples, proc.sample_rate)
        risk = compute_risk(rolling, caller_known=_parse_bool(caller_known),
                            urgent_request=_parse_bool(urgent_request),
                            sensitive_action=_parse_bool(sensitive_action),
                            high_value_transaction=_parse_bool(high_value_transaction),
                            replay_indicator=replay["replay_indicator"])
        return ChunkAnalysisResponse(
            session_id=sid, chunk_index=int(chunk_index), ai_probability=round(float(ai_prob), 4),
            genuine_probability=round(1.0 - float(ai_prob), 4), rolling_ai_probability=rolling,
            voice_risk=risk.voice_risk, context_risk_adjustment=risk.context_risk_adjustment,
            final_risk_score=risk.final_risk_score, risk_level=risk.risk_level,
            classification=risk.classification, prediction=risk.prediction,
            confidence=round(max(rolling, 1.0 - rolling), 4),
            replay_indicator=replay["replay_indicator"], recommendation=recommend(risk.risk_level),
            model_mode=infer.get_inference_state().get("mode"))
    finally:
        safe_delete(tmp_path)
