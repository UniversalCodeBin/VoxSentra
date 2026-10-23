"""Feature extraction: log-Mel spectrogram (primary model input) + supporting DSP features.

Uses librosa when available; otherwise a numpy/scipy fallback mel implementation so the
backend stays testable without heavy deps. Preprocessing config must match training
(models/model_config.json).
"""
from __future__ import annotations
import json
import math
import os
from dataclasses import asdict, dataclass

import numpy as np

from backend.config import get_settings

try:
    import librosa as _librosa
    _HAS_LIBROSA = True
except Exception:
    _librosa = None
    _HAS_LIBROSA = False


@dataclass
class MelConfig:
    sample_rate: int = 16000
    n_mels: int = 128
    n_fft: int = 1024
    hop_length: int = 256
    fmax: int = 8000
    window_seconds: float = 5.0

    @property
    def n_frames(self) -> int:
        total = int(self.sample_rate * self.window_seconds)
        return 1 + max(0, (total - self.n_fft) // self.hop_length)


def get_mel_config() -> MelConfig:
    s = get_settings()
    cfg_path = s.MODEL_CONFIG_PATH
    if os.path.exists(cfg_path):
        try:
            with open(cfg_path) as f:
                d = json.load(f).get("mel", {})
            return MelConfig(
                sample_rate=int(d.get("sample_rate", s.SAMPLE_RATE)),
                n_mels=int(d.get("n_mels", s.N_MELS)),
                n_fft=int(d.get("n_fft", s.N_FFT)),
                hop_length=int(d.get("hop_length", s.HOP_LENGTH)),
                fmax=int(d.get("fmax", s.FMAX)),
                window_seconds=float(d.get("window_seconds", s.ANALYSIS_WINDOW_SECONDS)),
            )
        except Exception:
            pass
    return MelConfig(s.SAMPLE_RATE, s.N_MELS, s.N_FFT, s.HOP_LENGTH, s.FMAX, s.ANALYSIS_WINDOW_SECONDS)


def default_model_config() -> dict:
    cfg = get_mel_config()
    return {"mel": asdict(cfg), "labels": {"0": "genuine", "1": "ai_generated"}}


# ---------- Mel filterbank (fallback) ----------

def _hz_to_mel(hz: float) -> float:
    return 2595.0 * math.log10(1.0 + hz / 700.0)


def _mel_to_hz(mel: float) -> float:
    return 700.0 * (10.0 ** (mel / 2595.0) - 1.0)


def _mel_filterbank(sr: int, n_fft: int, n_mels: int, fmax: int) -> np.ndarray:
    fmin = 0.0
    m_min, m_max = _hz_to_mel(fmin), _hz_to_mel(float(fmax))
    points = np.linspace(m_min, m_max, n_mels + 2)
    hz = np.array([_mel_to_hz(m) for m in points])
    bins = np.floor((n_fft + 1) * hz / sr).astype(int)
    fb = np.zeros((n_mels, n_fft // 2 + 1), dtype=np.float32)
    for m in range(1, n_mels + 1):
        f0, f1, f2 = bins[m - 1], bins[m], bins[m + 1]
        if f1 > f0:
            fb[m - 1, f0:f1] = (np.arange(f0, f1) - f0) / max(1, (f1 - f0))
        if f2 > f1:
            fb[m - 1, f1:f2] = (f2 - np.arange(f1, f2)) / max(1, (f2 - f1))
    return fb


def _stft_power(samples: np.ndarray, n_fft: int, hop: int) -> np.ndarray:
    x = np.asarray(samples, dtype=np.float32)
    if x.size < n_fft:
        x = np.pad(x, (0, n_fft - x.size))
    window = np.hanning(n_fft).astype(np.float32)
    frames = 1 + (len(x) - n_fft) // hop
    out = np.empty((n_fft // 2 + 1, frames), dtype=np.float32)
    for i in range(frames):
        seg = x[i * hop: i * hop + n_fft] * window
        spec = np.fft.rfft(seg, n=n_fft)
        out[:, i] = (np.abs(spec) ** 2).astype(np.float32)
    return out


def log_mel_spectrogram(samples: np.ndarray, cfg: MelConfig | None = None) -> np.ndarray:
    """Return (n_mels, frames) log-mel spectrogram (natural log, stabilized)."""
    cfg = cfg or get_mel_config()
    x = np.asarray(samples, dtype=np.float32)
    need = int(cfg.sample_rate * cfg.window_seconds)
    if len(x) < need:
        x = np.pad(x, (0, need - len(x)))
    else:
        x = x[:need]
    if _HAS_LIBROSA and _librosa is not None:
        # center=False + top_db=None keep this path numerically aligned with the
        # numpy fallback below (same frame count, no 80 dB clamp), so training
        # and inference produce identical inputs regardless of installed libs.
        S = _librosa.feature.melspectrogram(y=x, sr=cfg.sample_rate, n_fft=cfg.n_fft,
                                            hop_length=cfg.hop_length, n_mels=cfg.n_mels,
                                            fmax=cfg.fmax, power=2.0, center=False)
        return _librosa.power_to_db(S, ref=np.max, top_db=None).astype(np.float32)
    power = _stft_power(x, cfg.n_fft, cfg.hop_length)
    fb = _mel_filterbank(cfg.sample_rate, cfg.n_fft, cfg.n_mels, cfg.fmax)
    mel = np.maximum(fb @ power, 1e-10)
    ref = float(np.max(mel))
    return (10.0 * np.log10(mel / max(ref, 1e-10) + 1e-10)).astype(np.float32)


# ---------- Supporting DSP features ----------

def _safe(values: np.ndarray) -> np.ndarray:
    v = np.asarray(values, dtype=np.float64)
    return v[np.isfinite(v)]


def mfcc_mean(samples: np.ndarray, sr: int, n_mfcc: int = 20) -> np.ndarray:
    x = np.asarray(samples, dtype=np.float32)
    if _HAS_LIBROSA and _librosa is not None:
        try:
            m = _librosa.feature.mfcc(y=x, sr=sr, n_mfcc=n_mfcc)
            return np.mean(m, axis=1).astype(np.float32)
        except Exception:
            pass
    # fallback: DCT of log-mel
    from scipy.fft import dct
    mel = log_mel_spectrogram(x)
    return dct(mel.mean(axis=1), type=2, norm="ortho")[:n_mfcc].astype(np.float32)


def _spectral_stats(samples: np.ndarray, sr: int, n_fft: int = 1024, hop: int = 256) -> dict:
    power = _stft_power(np.asarray(samples, dtype=np.float32), n_fft, hop)
    mag = np.sqrt(power + 1e-10)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    total = mag.sum(axis=0) + 1e-10
    centroid = (freqs[:, None] * mag).sum(axis=0) / total
    spread = np.sqrt((((freqs[:, None] - centroid) ** 2) * mag).sum(axis=0) / total)
    cumsum = np.cumsum(mag, axis=0)
    rolloff_idx = np.argmax(cumsum >= 0.85 * total, axis=0)
    rolloff = freqs[np.clip(rolloff_idx, 0, len(freqs) - 1)]
    return {"centroid": centroid, "bandwidth": spread, "rolloff": rolloff, "mag": mag}


def _pitch_stats(samples: np.ndarray, sr: int) -> dict:
    x = np.asarray(samples, dtype=np.float32)
    if _HAS_LIBROSA and _librosa is not None:
        try:
            f0, _, _ = _librosa.pyin(x, fmin=50, fmax=500, sr=sr)
            v = f0[np.isfinite(f0)]
            if v.size > 4:
                return {"mean": float(np.mean(v)), "std": float(np.std(v)), "ok": True}
        except Exception:
            pass
    # fallback autocorrelation pitch estimate per 40ms frame
    frame = int(sr * 0.04)
    vals = []
    for i in range(0, max(0, len(x) - frame), frame):
        seg = x[i:i + frame] - x[i:i + frame].mean()
        if np.max(np.abs(seg)) < 1e-3:
            continue
        corr = np.correlate(seg, seg, mode="full")[frame - 1:]
        corr[: int(sr / 500)] = 0
        peak = int(np.argmax(corr[: int(sr / 50)]))
        if peak > 0 and corr[peak] > 0:
            vals.append(sr / float(peak))
    vals = np.array([v for v in vals if 50 <= v <= 500])
    if vals.size < 4:
        return {"mean": 0.0, "std": 0.0, "ok": False}
    return {"mean": float(vals.mean()), "std": float(vals.std()), "ok": True}


def extract_supporting_features(samples: np.ndarray, sample_rate: int) -> dict:
    """Return 0-100 scaled supporting indicators + raw stats. DSP heuristics only."""
    x = np.asarray(samples, dtype=np.float32)
    if x.size == 0:
        return {k: 0.0 for k in ("spectral_anomaly", "mfcc_pattern", "pitch_consistency",
                                 "prosody_anomaly", "energy_variation", "pause_pattern")}
    stats = _spectral_stats(x, sample_rate)
    cent = _safe(stats["centroid"])
    bw = _safe(stats["bandwidth"])

    # RMS energy variation across 100ms frames
    fl = max(1, int(sample_rate * 0.1))
    rms_frames = np.array([float(np.sqrt(np.mean(x[i:i + fl] ** 2))) for i in range(0, len(x) - fl + 1, fl)])
    rms_frames = rms_frames[rms_frames > 1e-6]
    energy_cv = float(np.std(rms_frames) / (np.mean(rms_frames) + 1e-9)) if rms_frames.size > 2 else 0.0
    # pause ratio
    pause_ratio = float(np.mean(np.abs(x) < 0.02 * (float(np.max(np.abs(x))) + 1e-9)))

    pitch = _pitch_stats(x, sample_rate)
    pitch_cv = float(pitch["std"] / (pitch["mean"] + 1e-9)) if pitch["ok"] and pitch["mean"] > 0 else 0.5

    mfcc = mfcc_mean(x, sample_rate)
    mfcc_spread = float(np.std(mfcc))

    def scale(v: float, lo: float, hi: float) -> float:
        if hi <= lo:
            return 0.0
        return float(max(0.0, min(100.0, (v - lo) / (hi - lo) * 100.0)))

    # Heuristic scalings: unusually LOW variation in pitch/energy can suggest synthetic
    # steadiness; unusually HIGH spectral flatness/noise can suggest artifacts.
    spectral_anomaly = scale(float(np.std(cent) / (np.mean(cent) + 1e-9)), 0.0, 0.6) * 0.5 + \
        scale(float(np.mean(bw) / 4000.0), 0.0, 1.5) * 0.5
    mfcc_pattern = scale(mfcc_spread, 2.0, 40.0)
    pitch_consistency = (100.0 - scale(pitch_cv, 0.0, 0.6)) if pitch["ok"] else 50.0
    prosody_anomaly = scale(abs(energy_cv - 0.55), 0.0, 0.55)
    energy_variation = scale(energy_cv, 0.0, 1.2)
    pause_pattern = scale(abs(pause_ratio - 0.18), 0.0, 0.4)

    out = {
        "spectral_anomaly": round(float(spectral_anomaly), 1),
        "mfcc_pattern": round(float(mfcc_pattern), 1),
        "pitch_consistency": round(float(pitch_consistency), 1),
        "prosody_anomaly": round(float(prosody_anomaly), 1),
        "energy_variation": round(float(energy_variation), 1),
        "pause_pattern": round(float(pause_pattern), 1),
    }
    return out


def feature_summary_for_db(indicators: dict) -> dict:
    return {k: round(float(v), 1) for k, v in indicators.items()}
