"""Replay/recorded-audio indicator (secondary, heuristic — never 'confirmed')."""
import numpy as np


def analyze_replay(samples: np.ndarray, sample_rate: int) -> dict:
    """Return {replay_indicator, confidence, label}. Heuristic DSP cues only."""
    x = np.asarray(samples, dtype=np.float32)
    if x.size < sample_rate:
        return {"replay_indicator": False, "confidence": 0.0, "label": "NO_REPLAY_INDICATION"}
    # Cue 1: background consistency — low variance of noise floor across 200ms frames
    fl = int(sample_rate * 0.2)
    floors = []
    for i in range(0, len(x) - fl + 1, fl):
        seg = np.abs(x[i:i + fl])
        floors.append(float(np.percentile(seg, 10)))
    floors = np.array(floors)
    consistency = 0.0
    if floors.size > 3 and float(np.mean(floors)) > 1e-6:
        cv = float(np.std(floors) / (np.mean(floors) + 1e-9))
        consistency = max(0.0, min(1.0, 1.0 - cv * 2.0))
    # Cue 2: band-energy anomaly — excess very-high-frequency / low-frequency regularity
    spec = np.abs(np.fft.rfft(x[:min(len(x), sample_rate * 4)]))
    freqs = np.fft.rfftfreq(min(len(x), sample_rate * 4), 1.0 / sample_rate)
    hi = float(spec[freqs > 7000].mean()) if (freqs > 7000).any() else 0.0
    mid = float(spec[(freqs > 300) & (freqs < 3400)].mean()) + 1e-9
    hf_ratio = hi / mid
    hf_cue = max(0.0, min(1.0, (hf_ratio - 0.05) * 4.0))
    # Cue 3: repeated-pattern cue via autocorrelation peak (looped playback)
    seg = x[: sample_rate * 4] - np.mean(x[: sample_rate * 4])
    corr = np.correlate(seg, seg, mode="full")[len(seg) - 1:]
    corr = corr / (corr[0] + 1e-9)
    lag_region = corr[int(sample_rate * 0.1): int(sample_rate * 2.0)]
    loop_cue = float(np.max(lag_region)) if lag_region.size else 0.0
    loop_cue = max(0.0, min(1.0, (loop_cue - 0.3) * 2.0))

    confidence = round(float(0.5 * consistency + 0.25 * hf_cue + 0.25 * loop_cue), 3)
    indicator = confidence >= 0.55
    return {
        "replay_indicator": bool(indicator),
        "confidence": confidence,
        "label": "POSSIBLE_REPLAY" if indicator else "NO_REPLAY_INDICATION",
    }
