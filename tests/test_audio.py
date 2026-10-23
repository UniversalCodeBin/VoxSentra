import os
import tempfile

import numpy as np
from scipy.io import wavfile

from backend.services import audio_processor as ap


def _wav(path, secs=4.0, sr=16000):
    t = np.arange(int(sr * secs)) / sr
    wavfile.write(path, sr, (0.5 * np.sin(2 * np.pi * 220 * t) * 32767).astype(np.int16))


def test_valid_wav_processes():
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        p = f.name
    try:
        _wav(p)
        out = ap.process_audio_file(p, original_filename="a.wav")
        assert out.sample_rate == 16000
        assert out.duration >= 3.0
        assert out.num_segments >= 1
    finally:
        os.remove(p)


def test_too_short_rejected():
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        p = f.name
    try:
        _wav(p, secs=1.0)
        try:
            ap.process_audio_file(p, original_filename="a.wav")
            raise AssertionError("should have raised")
        except ap.AudioTooShortError:
            pass
    finally:
        os.remove(p)


def test_invalid_file_rejected():
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(b"not audio at all" * 100)
        p = f.name
    try:
        try:
            ap.process_audio_file(p, original_filename="a.wav")
            raise AssertionError("should have raised")
        except ap.AudioValidationError:
            pass
    finally:
        os.remove(p)


def test_empty_file_rejected():
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        p = f.name
    try:
        try:
            ap.process_audio_file(p, original_filename="a.wav")
            raise AssertionError("should have raised")
        except ap.AudioValidationError:
            pass
    finally:
        os.remove(p)


def test_unsupported_format_rejected():
    assert not __import__("backend.utils.validators", fromlist=["x"]).is_allowed_extension("evil.exe")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        p = f.name
    try:
        _wav(p)
        try:
            ap.validate_audio(p, original_filename="x.exe")
            raise AssertionError("should have raised")
        except ap.UnsupportedFormatError:
            pass
    finally:
        os.remove(p)


def test_mono_resample_normalize_segment():
    x = np.random.RandomState(0).randn(32000).astype(np.float32)
    stereo = np.stack([x, x], axis=1)
    m = ap.convert_to_mono(stereo)
    assert m.ndim == 1
    r = ap.resample_audio(m, 16000, 8000)
    assert len(r) == 16000
    n = ap.normalize_audio(np.array([0.1, 0.2, -0.1], dtype=np.float32))
    assert abs(float(np.max(np.abs(n))) - 0.98) < 1e-3
    segs = ap.create_segments(np.zeros(16000 * 12, dtype=np.float32), 16000, window_seconds=5.0)
    assert len(segs) >= 2
