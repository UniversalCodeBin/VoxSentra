"""Audio validation, decoding, preprocessing, segmentation.

Dependency strategy (hackathon-safe):
- Prefer soundfile -> librosa -> scipy.io.wavfile -> ffmpeg transcode.
- All heavy imports are lazy/optional so the backend boots without torch/librosa.
"""
from dataclasses import dataclass, field
from typing import Optional
import os
import subprocess

import numpy as np

from backend.config import get_settings


class AudioValidationError(ValueError):
    pass


class AudioTooShortError(AudioValidationError):
    pass


class UnsupportedFormatError(AudioValidationError):
    pass


class NoSpeechError(AudioValidationError):
    pass


@dataclass
class ProcessedAudio:
    samples: np.ndarray
    sample_rate: int
    duration: float
    speech_detected: bool
    segments: list[np.ndarray] = field(default_factory=list)
    num_segments: int = 0


ALLOWED_EXTS = {".wav", ".mp3", ".m4a", ".flac"}


def validate_audio(path: str, original_filename: str = "", content_type: str = "") -> None:
    settings = get_settings()
    ext = os.path.splitext(original_filename or path)[1].lower()
    if ext and ext not in ALLOWED_EXTS:
        raise UnsupportedFormatError("Unsupported audio format. Supported formats: WAV, MP3, M4A, FLAC.")
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        raise AudioValidationError("Unable to process audio file. Please upload a supported audio format.")
    size = os.path.getsize(path)
    if size > settings.max_audio_bytes:
        raise AudioValidationError(
            f"File too large ({size / 1048576:.1f} MB). Maximum is {settings.MAX_AUDIO_SIZE_MB} MB."
        )


def _decode_with_soundfile(path: str):
    import soundfile as sf
    data, sr = sf.read(path, always_2d=False)
    return np.asarray(data, dtype=np.float32), int(sr)


def _decode_with_scipy(path: str):
    from scipy.io import wavfile
    sr, data = wavfile.read(path)
    arr = np.asarray(data, dtype=np.float32)
    if arr.dtype == np.int16:
        arr = arr / 32768.0
    elif arr.dtype == np.int32:
        arr = arr / 2147483648.0
    elif arr.dtype == np.uint8:
        arr = (arr.astype(np.float32) - 128.0) / 128.0
    return arr.astype(np.float32), int(sr)


def _transcode_with_ffmpeg(path: str, target_sr: int) -> tuple[np.ndarray, int]:
    import tempfile
    fd, tmp = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", path, "-ac", "1", "-ar", str(target_sr), "-f", "wav", tmp]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if r.returncode != 0 or not os.path.exists(tmp):
        raise AudioValidationError("Unable to process audio file. Please upload a supported audio format.")
    try:
        return _decode_with_scipy(tmp)
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def decode_audio(path: str) -> tuple[np.ndarray, int]:
    """Decode to float32 mono-ish array + native sr. Raises AudioValidationError if undecodable."""
    errors: list[str] = []
    for fn in (_decode_with_soundfile, _decode_with_scipy):
        try:
            return fn(path)
        except Exception as e:  # noqa: BLE001
            errors.append(f"{fn.__name__}: {e}")
    # Last resort: ffmpeg transcode (handles mp3/m4a/flac without soundfile/audioread)
    try:
        return _transcode_with_ffmpeg(path, get_settings().SAMPLE_RATE)
    except AudioValidationError:
        raise
    except Exception as e:  # noqa: BLE001
        errors.append(f"ffmpeg: {e}")
    raise AudioValidationError("Unable to process audio file. Please upload a supported audio format.")


def convert_to_mono(samples: np.ndarray) -> np.ndarray:
    arr = np.asarray(samples, dtype=np.float32)
    if arr.ndim == 2:
        arr = arr.mean(axis=1)
    return arr.astype(np.float32).ravel()


def resample_audio(samples: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
    if orig_sr == target_sr:
        return np.asarray(samples, dtype=np.float32)
    try:
        from scipy.signal import resample_poly
        from math import gcd
        g = gcd(orig_sr, target_sr)
        return resample_poly(samples, target_sr // g, orig_sr // g).astype(np.float32)
    except Exception:
        # linear-interp fallback
        x = np.asarray(samples, dtype=np.float32)
        ratio = target_sr / float(orig_sr)
        n = max(1, int(len(x) * ratio))
        old_idx = np.linspace(0, len(x) - 1, len(x))
        new_idx = np.linspace(0, len(x) - 1, n)
        return np.interp(new_idx, old_idx, x).astype(np.float32)


def normalize_audio(samples: np.ndarray, peak: float = 0.98) -> np.ndarray:
    x = np.asarray(samples, dtype=np.float32)
    m = float(np.max(np.abs(x))) if x.size else 0.0
    if m < 1e-9:
        return x
    return (x / m * peak).astype(np.float32)


def trim_silence(samples: np.ndarray, sample_rate: int, top_db: float = 30.0) -> np.ndarray:
    try:
        import librosa
        trimmed, _ = librosa.effects.trim(np.asarray(samples, dtype=np.float32), top_db=top_db)
        return trimmed.astype(np.float32) if trimmed.size else samples
    except Exception:
        # energy-based fallback: drop leading/trailing frames below threshold
        x = np.asarray(samples, dtype=np.float32)
        frame = max(1, int(sample_rate * 0.02))
        thr = float(np.max(np.abs(x))) * 0.02 if x.size else 0.0
        if thr <= 0:
            return x
        mag = np.abs(x)
        mask = mag > thr
        if not mask.any():
            return x
        idx = np.where(mask)[0]
        return x[max(0, idx[0] - frame): idx[-1] + frame]


def detect_speech(samples: np.ndarray, sample_rate: int) -> bool:
    """Simple energy-based VAD: True if enough frames exceed an adaptive threshold."""
    x = np.asarray(samples, dtype=np.float32)
    if x.size < sample_rate // 2:
        return False
    frame_len = int(sample_rate * 0.03)
    hop = int(sample_rate * 0.015)
    peak = float(np.max(np.abs(x)))
    if peak < 1e-4:
        return False
    thr = peak * 0.05
    voiced = 0
    total = 0
    for start in range(0, max(1, len(x) - frame_len), hop):
        total += 1
        if float(np.sqrt(np.mean(x[start:start + frame_len] ** 2))) > thr * 0.5:
            voiced += 1
    return total > 0 and (voiced / total) > 0.15


def validate_duration(duration: float) -> None:
    settings = get_settings()
    if duration < settings.MIN_AUDIO_DURATION_SECONDS:
        raise AudioTooShortError(
            f"Audio sample is too short ({duration:.1f}s). "
            f"Please provide at least {settings.MIN_AUDIO_DURATION_SECONDS:.0f} seconds."
        )
    if duration > settings.MAX_AUDIO_DURATION_SECONDS:
        raise AudioValidationError(
            f"Audio too long ({duration:.1f}s). Maximum is {settings.MAX_AUDIO_DURATION_SECONDS}s."
        )


def create_segments(samples: np.ndarray, sample_rate: int, window_seconds: Optional[float] = None) -> list[np.ndarray]:
    settings = get_settings()
    win = int((window_seconds or settings.ANALYSIS_WINDOW_SECONDS) * sample_rate)
    x = np.asarray(samples, dtype=np.float32)
    if len(x) <= win:
        return [x]
    segments = []
    hop = win  # non-overlapping for MVP stability
    for start in range(0, len(x) - win + 1, hop):
        segments.append(x[start:start + win])
    tail = len(x) % win
    if tail > sample_rate * 1.0:  # keep meaningful tail (>1s), pad to window
        last = x[-tail:]
        pad = np.zeros(win - len(last), dtype=np.float32)
        segments.append(np.concatenate([last, pad]))
    return segments or [x]


def process_audio_file(path: str, original_filename: str = "", content_type: str = "",
                       window_seconds: Optional[float] = None,
                       require_speech: bool = True) -> ProcessedAudio:
    settings = get_settings()
    validate_audio(path, original_filename, content_type)
    samples, native_sr = decode_audio(path)
    samples = convert_to_mono(samples)
    samples = resample_audio(samples, native_sr, settings.SAMPLE_RATE)
    samples = normalize_audio(samples)
    duration = len(samples) / float(settings.SAMPLE_RATE)
    validate_duration(duration)
    trimmed = trim_silence(samples, settings.SAMPLE_RATE)
    speech = detect_speech(trimmed if trimmed.size else samples, settings.SAMPLE_RATE)
    if require_speech and not speech:
        raise NoSpeechError("No usable speech detected. Please record again.")
    base = samples
    segments = create_segments(base, settings.SAMPLE_RATE, window_seconds)
    return ProcessedAudio(samples=base, sample_rate=settings.SAMPLE_RATE,
                          duration=len(base) / float(settings.SAMPLE_RATE),
                          speech_detected=speech, segments=segments, num_segments=len(segments))


def waveform_points(samples: np.ndarray, n_points: Optional[int] = None) -> list[float]:
    settings = get_settings()
    n = n_points or settings.WAVEFORM_POINTS
    x = np.asarray(samples, dtype=np.float32)
    if x.size == 0:
        return [0.0] * n
    block_size = len(x) / float(n)
    peaks = []
    for i in range(n):
        start = int(i * block_size)
        end = int((i + 1) * block_size)
        block = x[start:end]
        peak = float(np.max(np.abs(block))) if block.size else 0.0
        peaks.append(round(peak, 4))
    return peaks
