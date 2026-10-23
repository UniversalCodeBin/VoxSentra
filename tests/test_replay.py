import numpy as np

from backend.services.replay_detector import analyze_replay


def _tone(secs=5.0, sr=16000):
    t = np.arange(int(sr * secs)) / sr
    return (0.5 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)


def test_replay_returns_schema():
    out = analyze_replay(_tone(), 16000)
    assert set(out) == {"replay_indicator", "confidence", "label"}
    assert isinstance(out["replay_indicator"], bool)
    assert 0.0 <= out["confidence"] <= 1.0
    assert out["label"] in ("POSSIBLE_REPLAY", "NO_REPLAY_INDICATION")


def test_replay_never_claims_confirmed():
    out = analyze_replay(_tone(), 16000)
    assert "CONFIRMED" not in out["label"]


def test_short_audio_no_crash():
    out = analyze_replay(np.zeros(100, dtype=np.float32), 16000)
    assert out["replay_indicator"] is False
