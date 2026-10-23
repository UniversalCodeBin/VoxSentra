"""Mel preprocessing shared by training and inference (single source of truth)."""
from __future__ import annotations
import numpy as np


def compute_log_mel(samples: np.ndarray, sample_rate: int = 16000, n_mels: int = 128,
                    n_fft: int = 1024, hop_length: int = 256, fmax: int = 8000,
                    window_seconds: float = 5.0) -> np.ndarray:
    """Thin wrapper over backend feature extractor so training == inference preprocessing."""
    from backend.services.feature_extractor import MelConfig, log_mel_spectrogram
    cfg = MelConfig(sample_rate=sample_rate, n_mels=n_mels, n_fft=n_fft,
                    hop_length=hop_length, fmax=fmax, window_seconds=window_seconds)
    return log_mel_spectrogram(np.asarray(samples, dtype=np.float32), cfg)
