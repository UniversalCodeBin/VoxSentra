"""Guarded ASVspoof LA training launcher.

This command is intentionally opt-in. It never targets the demo model under
models/ and refuses to run unless the official manifest shape is present.

Dry-run (validation only):
    python scripts/train_asvspoof.py

Start full real training explicitly:
    python scripts/train_asvspoof.py --run

Time-constrained development training:
    python scripts/train_asvspoof.py --run --development
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
CONFIG_PATH = ROOT / "configs" / "asvspoof_training.json"


def load_config() -> dict:
    with CONFIG_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def validate_manifest(config: dict):
    from ml.dataset import load_manifest, speaker_independent_split

    raw_dir = config["dataset"]["raw_dir"]
    manifest = load_manifest(raw_dir)
    expected = config["dataset"]["required_splits"]
    splits = speaker_independent_split(manifest)
    actual = {name: len(splits[name]) for name in ("train", "val", "test")}
    if len(manifest) != config["dataset"]["required_rows"] or actual != expected:
        raise RuntimeError(f"ASVspoof manifest mismatch: rows={len(manifest)}, splits={actual}; expected official counts")
    if splits["strategy"] != "official_protocol_partitions":
        raise RuntimeError(f"Refusing non-official split strategy: {splits['strategy']}")
    if set(manifest["target"].unique()) != {0, 1}:
        raise RuntimeError("Manifest must contain both target labels 0 and 1")
    speaker_sets = {name: set(splits[name]["speaker"]) for name in ("train", "val", "test")}
    if (speaker_sets["train"] & speaker_sets["val"] or
            speaker_sets["train"] & speaker_sets["test"] or
            speaker_sets["val"] & speaker_sets["test"]):
        raise RuntimeError("Speaker overlap detected; refusing to train")
    return manifest, splits


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true", help="actually start training; omitted means preflight only")
    parser.add_argument("--development", action="store_true",
                        help="3-epoch balanced 1000/200 genuine/spoof subset run")
    args = parser.parse_args()
    config = load_config()
    manifest, splits = validate_manifest(config)
    out = {key: ROOT / value for key, value in config["outputs"].items()}
    if args.development:
        out = {"model": ROOT / "models/voice_detector.pt",
               "config": ROOT / "models/model_config.json",
               "metrics": ROOT / "models/metrics.json"}
    if any(path.exists() for path in out.values()):
        raise RuntimeError(f"Refusing to overwrite existing ASVspoof outputs: {', '.join(str(p) for p in out.values())}")
    print("ASVspoof manifest preflight: PASS")
    print(f"rows={len(manifest)} train={len(splits['train'])} val={len(splits['val'])} test={len(splits['test'])}")
    print("authoritative manifest remains untouched; evaluation split remains unused")
    if not args.run:
        print("DRY RUN: no training started. Pass --run to explicitly train.")
        return

    out["model"].parent.mkdir(parents=True, exist_ok=True)
    train = config["training"]
    epochs = 3 if args.development else train["epochs"]
    command = [sys.executable, "-m", "ml.train",
               "--raw-dir", config["dataset"]["raw_dir"],
               "--epochs", str(epochs), "--batch-size", str(train["batch_size"]),
               "--num-workers", str(train["num_workers"]), "--lr", str(train["learning_rate"]),
               "--seed", str(train["seed"]), "--model-path", str(out["model"]),
               "--config-path", str(out["config"]), "--metrics-path", str(out["metrics"])]
    if args.development:
        command.extend(["--train-samples-per-class", "1000",
                        "--val-samples-per-class", "200"])
    if train.get("evaluate_test", False):
        command.append("--evaluate-test")
    print("Starting ASVspoof training:", " ".join(command))
    subprocess.run(command, cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
