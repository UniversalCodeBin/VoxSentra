"""Model inference service. Loads the CNN ONCE at startup; explicit mock/unavailable states."""
from __future__ import annotations
import hashlib
import json
import logging
import os
import threading
import time

import numpy as np

from backend.config import get_settings
from backend.services.feature_extractor import get_mel_config, log_mel_spectrogram

logger = logging.getLogger(__name__)

_state = {"mode": "uninitialized", "detail": "", "model": None, "config": None, "metrics": None}
_lock = threading.Lock()


def _torch_available() -> bool:
    try:
        import torch  # noqa: F401
        return True
    except Exception:
        return False


def get_inference_state() -> dict:
    with _lock:
        return dict(_state)


def is_mock_mode() -> bool:
    return get_settings().MODEL_MODE.strip().lower() == "mock"


def load_model() -> dict:
    """Load once. Sets mode: 'real' | 'mock' | 'unavailable'."""
    s = get_settings()
    with _lock:
        if is_mock_mode():
            _state.update({"mode": "mock", "detail": "MODEL_MODE=mock (deterministic heuristic, NOT real ML)",
                           "model": None, "config": None, "metrics": None})
            return dict(_state)
        if not _torch_available():
            _state.update({"mode": "unavailable",
                           "detail": "torch not installed; set MODEL_MODE=mock for dev or install requirements",
                           "model": None, "config": None, "metrics": None})
            return dict(_state)
        if not os.path.exists(s.MODEL_PATH):
            _state.update({"mode": "unavailable",
                           "detail": f"model file not found: {s.MODEL_PATH}. Train via `python -m ml.train`.",
                           "model": None, "config": None, "metrics": None})
            return dict(_state)
        try:
            import torch
            from ml.model import VoiceCNN, model_config_for_n_mels
            cfg = {}
            if os.path.exists(s.MODEL_CONFIG_PATH):
                with open(s.MODEL_CONFIG_PATH) as f:
                    cfg = json.load(f)
            n_mels = int(((cfg.get("mel") or {}).get("n_mels")) or s.N_MELS)
            model = VoiceCNN(model_config_for_n_mels(n_mels))
            state = torch.load(s.MODEL_PATH, map_location="cpu")
            model.load_state_dict(state.get("state_dict", state) if isinstance(state, dict) else state)
            model.eval()
            metrics = {}
            if os.path.exists(s.METRICS_PATH):
                with open(s.METRICS_PATH) as f:
                    metrics = json.load(f)
            _state.update({"mode": "real", "detail": f"loaded {s.MODEL_PATH}",
                           "model": model, "config": cfg, "metrics": metrics})
        except Exception as e:  # noqa: BLE001
            logger.exception("model load failed")
            _state.update({"mode": "unavailable", "detail": f"load failed: {e}",
                           "model": None, "config": None, "metrics": None})
        return dict(_state)


def _mock_probability(mel: np.ndarray) -> float:
    """Deterministic heuristic: stable across runs; clearly NOT a trained model."""
    h = hashlib.sha256(np.ascontiguousarray(mel).tobytes()).hexdigest()
    base = int(h[:8], 16) / 0xFFFFFFFF
    flatness = float(np.std(mel) / (abs(np.mean(mel)) + 1e-6))
    score = 0.15 + 0.5 * min(1.0, flatness / 3.0) + 0.2 * base
    return round(max(0.02, min(0.98, score)), 4)


class ModelUnavailableError(RuntimeError):
    pass


def predict_segment(samples: np.ndarray) -> tuple[float, float]:
    """Return (ai_prob, infer_ms). Uses real CNN if loaded, mock heuristic in mock mode."""
    st = get_inference_state()
    mel = log_mel_spectrogram(samples, get_mel_config())
    t0 = time.perf_counter()
    try:
        if st["mode"] == "real" and st["model"] is not None:
            import torch
            x = torch.from_numpy(mel).unsqueeze(0).unsqueeze(0).float()
            with torch.no_grad():
                logit = st["model"](x).squeeze().item()
            ai = float(1.0 / (1.0 + np.exp(-logit)))
        elif st["mode"] == "mock":
            ai = _mock_probability(mel)
        else:
            raise ModelUnavailableError("model unavailable")
    except ModelUnavailableError:
        raise RuntimeError(f"Analysis temporarily unavailable. Please retry. ({st.get('detail', '')})")
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(f"Analysis temporarily unavailable. Please retry. ({st.get('detail', '')})") from e
    ms = (time.perf_counter() - t0) * 1000.0
    ai = max(0.0, min(1.0, ai))
    return ai, ms


def predict(segments: list[np.ndarray]) -> dict:
    if not segments:
        raise RuntimeError("Analysis temporarily unavailable. Please retry.")
    probs: list[float] = []
    total_ms = 0.0
    for seg in segments:
        p, ms = predict_segment(np.asarray(seg, dtype=np.float32))
        probs.append(round(float(p), 4))
        total_ms += ms
    ai = round(float(np.mean(probs)), 4) if probs else 0.0
    return {
        "segment_count": len(probs),
        "segment_probabilities": probs,
        "ai_probability": ai,
        "genuine_probability": round(1.0 - ai, 4),
        "confidence": round(max(ai, 1.0 - ai), 4),
        "inference_time_ms": int(total_ms),
    }


def aggregate_rolling(past: list[float], window: int) -> float:
    if not past:
        return 0.0
    w = max(1, int(window))
    return round(float(np.mean(past[-w:])), 4)
