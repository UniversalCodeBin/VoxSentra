"""Truthful, non-training Review-2 readiness check."""
from __future__ import annotations

import importlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def status(name: str, passed: bool, detail: str = "") -> bool:
    print(f"{name}: {'PASS' if passed else 'FAIL'}" + (f" — {detail}" if detail else ""))
    return passed


def main() -> None:
    print("REVIEW 2 READINESS")
    metadata = ROOT / "data/raw/metadata.csv"
    dataset_ok = metadata.is_file()
    dataset_detail = str(metadata.relative_to(ROOT)) if dataset_ok else "metadata missing"
    if dataset_ok:
        try:
            from ml.dataset import load_manifest
            dataset_ok = len(load_manifest()) > 0
        except Exception as exc:  # noqa: BLE001
            dataset_ok = False
            dataset_detail = f"manifest cannot resolve its audio paths: {exc}"
    status("Dataset", dataset_ok, dataset_detail)

    deps_ok = True
    for package in ("torch", "librosa", "soundfile", "numpy", "scipy", "sklearn", "matplotlib"):
        try:
            importlib.import_module(package)
        except Exception as exc:  # noqa: BLE001
            deps_ok = False
            print(f"  dependency error: {package}: {exc}")
    status("Dependencies", deps_ok)

    try:
        from ml.model import VoiceCNN
        cnn_ok = VoiceCNN is not None
    except Exception as exc:  # noqa: BLE001
        cnn_ok = False
        print(f"  CNN error: {exc}")
    status("CNN", cnn_ok)

    checkpoint = ROOT / "models/voice_detector.pt"
    config = ROOT / "models/model_config.json"
    checkpoint_ok = checkpoint.is_file() and config.is_file()
    status("Checkpoint", checkpoint_ok, "missing trained checkpoint/config" if not checkpoint_ok else "checkpoint and config found")

    preprocess_ok = False
    if dataset_ok:
        try:
            from backend.services.audio_processor import process_audio_file
            from backend.services.feature_extractor import log_mel_spectrogram
            from ml.dataset import load_manifest
            row = load_manifest().iloc[0]
            audio = process_audio_file(row["file"], original_filename=Path(row["file"]).name)
            preprocess_ok = log_mel_spectrogram(audio.segments[0]).shape[0] == 128
        except Exception as exc:  # noqa: BLE001
            print(f"  preprocessing error: {exc}")
    status("Preprocessing", preprocess_ok)

    real_inference = False
    if checkpoint_ok:
        try:
            from backend.services import inference
            real_inference = inference.load_model().get("mode") == "real"
        except Exception as exc:  # noqa: BLE001
            print(f"  inference error: {exc}")
    status("Real inference", real_inference, "blocked without a real checkpoint" if not real_inference else "loaded CNN")

    backend_ok = (ROOT / "backend/api/analysis.py").is_file()
    frontend_ok = (ROOT / "VoxSentra-Voice-Security-Dashboard/artifacts/voxsentra/src/api/analysis.ts").is_file()
    demo_ok = all((ROOT / p).is_file() for p in ("demo/README.md", "demo/genuine_sample.wav", "demo/spoof_sample.wav"))
    status("Backend", backend_ok)
    status("Frontend", frontend_ok)
    status("E2E", real_inference and backend_ok and frontend_ok, "requires real model inference")
    status("Demo assets", demo_ok)


if __name__ == "__main__":
    main()
