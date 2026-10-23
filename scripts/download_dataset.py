"""Dataset download helper.

Recommended MVP dataset: ASVspoof 2019 Logical Access (genuine bonafide vs TTS/VC spoof).
- Source: https://www.asvspoof.org/  (request access; research/competition license)
- Alternative tiny/quick: `audio-deepfake` sample sets or Mozilla Common Voice (genuine only,
  pair with a TTS generator for synthetic) — document whatever you use in data/README.md.

Usage:
  python scripts/download_dataset.py --help
  python scripts/download_dataset.py --list
  python scripts/download_dataset.py --synthetic-demo  # builds a tiny local demo set (sine/noise) for pipeline smoke tests
"""
import argparse
import csv
import os

import numpy as np


def synthetic_demo(raw_dir: str = "data/raw", n_per_class: int = 6, sr: int = 16000, secs: float = 5.0) -> str:
    from scipy.io import wavfile
    os.makedirs(raw_dir, exist_ok=True)
    rng = np.random.RandomState(0)
    rows = []
    t = np.arange(int(sr * secs)) / sr
    for i in range(n_per_class):
        f0 = 110 + 20 * np.sin(i)
        genuine = (0.5 * np.sin(2 * np.pi * (f0 + 8 * np.sin(2 * np.pi * 3 * t)) * t)
                   + 0.05 * rng.randn(len(t))).astype(np.float32)
        p = os.path.join(raw_dir, f"genuine_spk{i % 3}_{i}.wav")
        wavfile.write(p, sr, (genuine * 30000).astype(np.int16))
        rows.append((p, f"spk{i % 3}", "genuine"))
        flat = (0.5 * np.sin(2 * np.pi * 220.0 * t) + 0.001 * rng.randn(len(t))).astype(np.float32)
        q = os.path.join(raw_dir, f"fake_spk{i % 3}_{i}.wav")
        wavfile.write(q, sr, (flat * 30000).astype(np.int16))
        rows.append((q, f"spk{i % 3}", "fake"))
    meta = os.path.join(raw_dir, "metadata.csv")
    with open(meta, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["file", "speaker", "label"])
        for p, sp, lab in rows:
            w.writerow([os.path.basename(p), sp, lab])
    return meta


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--synthetic-demo", action="store_true")
    ap.add_argument("--raw-dir", default="data/raw")
    args = ap.parse_args()
    if args.list or (not args.synthetic_demo):
        print("Recommended datasets:")
        print("  1. ASVspoof 2019 LA — bonafide vs 13 TTS/VC spoof systems. https://www.asvspoof.org/ (gated, research license).")
        print("     Place FLACs under data/raw/ and write data/raw/metadata.csv (file,speaker,label).")
        print("  2. ASVspoof 2021 DF — deepfake track, in-the-wild codecs.")
        print("  3. WaveFake (https://github.com/RUB-SysSec/WaveFake) — MIT-ish, TTS vocoders, fast download.")
        print("  4. Mozilla Common Voice (genuine only, CC0) + local TTS for synthetic.")
    if args.synthetic_demo:
        meta = synthetic_demo(args.raw_dir)
        print(f"wrote synthetic pipeline-smoke dataset manifest: {meta}")
        print("NOTE: synthetic tones are for pipeline testing ONLY — never report metrics from them as model performance.")


if __name__ == "__main__":
    main()
