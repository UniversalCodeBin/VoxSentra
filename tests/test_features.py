import numpy as np

from backend.services.feature_extractor import (
    extract_supporting_features,
    get_mel_config,
    log_mel_spectrogram,
)


def _speech(sr=16000, secs=5.0):
    t = np.arange(int(sr * secs)) / sr
    return (0.5 * np.sin(2 * np.pi * (180 + 10 * np.sin(2 * np.pi * 2 * t)) * t)).astype(np.float32)


def test_mel_shape():
    cfg = get_mel_config()
    mel = log_mel_spectrogram(_speech(), cfg)
    assert mel.shape[0] == cfg.n_mels
    assert mel.shape[1] > 10
    assert np.all(np.isfinite(mel))


def test_mfcc_finite():
    from backend.services.feature_extractor import mfcc_mean
    m = mfcc_mean(_speech(), 16000)
    assert m.shape[0] == 20
    assert np.all(np.isfinite(m))


def test_supporting_indicators_range():
    ind = extract_supporting_features(_speech(), 16000)
    assert set(ind) >= {"spectral_anomaly", "mfcc_pattern", "pitch_consistency",
                        "prosody_anomaly", "energy_variation", "pause_pattern"}
    for v in ind.values():
        assert 0.0 <= v <= 100.0
        assert np.isfinite(v)


def test_no_nan_inf_on_silence_and_noise():
    for x in (np.zeros(16000 * 5, dtype=np.float32),
              np.random.RandomState(1).randn(16000 * 5).astype(np.float32) * 0.1):
        mel = log_mel_spectrogram(x)
        assert np.all(np.isfinite(mel))
