"""Evaluation entrypoint:  python -m ml.evaluate

Loads saved model + manifest test split (speaker-independent), prints honestly
computed accuracy/precision/recall/F1/confusion-matrix/ROC-AUC with emphasis on
AI-class recall, and writes reports/*.png artifacts.
"""
from __future__ import annotations
import argparse
import json
import os
import sys

from ml.utils import binary_metrics, save_json


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-dir", default="data/raw")
    ap.add_argument("--model-path", default="models/voice_detector.pt")
    ap.add_argument("--config-path", default="models/model_config.json")
    ap.add_argument("--reports-dir", default="reports")
    args = ap.parse_args()

    try:
        import torch
    except Exception:
        print("ERROR: torch is required for evaluation.", file=sys.stderr)
        sys.exit(2)
    if not os.path.exists(args.model_path):
        print(f"ERROR: model not found: {args.model_path}. Train first: python -m ml.train", file=sys.stderr)
        sys.exit(3)

    from backend.services.feature_extractor import MelConfig
    from ml.dataset import load_manifest, speaker_independent_split
    from ml.model import VoiceCNN
    from ml.train import build_arrays

    try:
        df = load_manifest(args.raw_dir)
    except (FileNotFoundError, ValueError) as e:
        print(f"DATASET BLOCKER: {e}", file=sys.stderr)
        sys.exit(3)

    cfg = {}
    if os.path.exists(args.config_path):
        with open(args.config_path) as f:
            cfg = json.load(f)
    m = (cfg.get("mel") or {})
    mel = MelConfig(sample_rate=int(m.get("sample_rate", 16000)), n_mels=int(m.get("n_mels", 128)),
                    n_fft=int(m.get("n_fft", 1024)), hop_length=int(m.get("hop_length", 256)),
                    fmax=int(m.get("fmax", 8000)), window_seconds=float(m.get("window_seconds", 5.0)))
    splits = speaker_independent_split(df)
    Xte, yte = build_arrays(splits["test"], mel)

    model = VoiceCNN({"n_mels": mel.n_mels, "n_channels": [32, 64, 128], "dropout": 0.3})
    state = torch.load(args.model_path, map_location="cpu")
    model.load_state_dict(state.get("state_dict", state))
    model.eval()
    with torch.no_grad():
        prob = torch.sigmoid(model(torch.from_numpy(Xte))).numpy()
    metrics = binary_metrics(yte, prob)
    print(json.dumps(metrics, indent=2))
    print(f"AI-generated class recall: {metrics['ai_recall']} (key metric — missed fakes matter most)")

    os.makedirs(args.reports_dir, exist_ok=True)
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from sklearn.metrics import RocCurveDisplay, ConfusionMatrixDisplay
    ConfusionMatrixDisplay.from_predictions(yte, (prob >= 0.5).astype(int),
                                            display_labels=["genuine", "ai_generated"])
    plt.title("confusion_matrix")
    plt.savefig(os.path.join(args.reports_dir, "confusion_matrix.png"))
    plt.close()
    try:
        RocCurveDisplay.from_predictions(yte, prob)
        plt.title("roc_curve")
        plt.savefig(os.path.join(args.reports_dir, "roc_curve.png"))
        plt.close()
    except Exception as e:  # noqa: BLE001
        print(f"ROC plot skipped: {e}")
    save_json(os.path.join(args.reports_dir, "eval_metrics.json"), metrics)


if __name__ == "__main__":
    main()
