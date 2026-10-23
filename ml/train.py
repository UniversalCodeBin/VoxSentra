"""Training entrypoint:  python -m ml.train [--epochs N ...]

Loads manifest, official/speaker-independent split, streamed log-mel features,
trains VoiceCNN with BCEWithLogitsLoss, and saves best model + configuration.
Exits with a clear blocker message (exit code 3) when no dataset is available.
"""
from __future__ import annotations
import argparse
import os
import sys
import time

import numpy as np

from backend.services.feature_extractor import MelConfig
from ml.utils import binary_metrics, save_json, save_training_plots, seed_everything
from ml.preprocessing import compute_log_mel


def load_audio_mono(path: str, target_sr: int) -> np.ndarray:
    from backend.services.audio_processor import convert_to_mono, decode_audio, resample_audio, normalize_audio
    samples, sr = decode_audio(path)
    samples = convert_to_mono(samples)
    samples = resample_audio(samples, sr, target_sr)
    return normalize_audio(samples)


class MelDataset:
    """Decode and transform one manifest row on demand to keep LA training in RAM."""
    def __init__(self, df, mel: MelConfig):
        self.rows = df[["file", "target"]].reset_index(drop=True)
        self.mel = mel

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, index):
        import torch
        row = self.rows.iloc[index]
        x = load_audio_mono(row["file"], self.mel.sample_rate)
        feature = compute_log_mel(x, self.mel.sample_rate, self.mel.n_mels,
                                  self.mel.n_fft, self.mel.hop_length,
                                  self.mel.fmax, self.mel.window_seconds)
        return torch.from_numpy(feature).unsqueeze(0).float(), torch.tensor(float(row["target"]), dtype=torch.float32)


def build_arrays(df, mel: MelConfig):
    """Compatibility helper retained for explicit evaluation tooling.

    The training entrypoint intentionally uses MelDataset instead: loading all
    ASVspoof partitions into dense arrays would exceed ordinary workstation RAM.
    """
    from ml.preprocessing import compute_log_mel
    Xs, ys = [], []
    for _, row in df.iterrows():
        try:
            x = load_audio_mono(row["file"], mel.sample_rate)
            Xs.append(compute_log_mel(x, mel.sample_rate, mel.n_mels, mel.n_fft,
                                      mel.hop_length, mel.fmax, mel.window_seconds))
            ys.append(int(row["target"]))
        except Exception as e:  # noqa: BLE001
            print(f"skip {row['file']}: {e}")
    if not Xs:
        raise RuntimeError("No usable training audio.")
    return np.stack(Xs)[:, None, :, :].astype("float32"), np.array(ys, dtype="float32")


def evaluate_loader(model, loader, loss_fn, torch):
    """Compute loss and accuracy without retaining every logit in memory."""
    model.eval()
    total_loss = total = correct = 0
    with torch.no_grad():
        for xb, yb in loader:
            logits = model(xb)
            loss = loss_fn(logits, yb)
            total_loss += loss.item() * len(yb)
            total += len(yb)
            correct += ((torch.sigmoid(logits) >= 0.5) == (yb >= 0.5)).sum().item()
    if not total:
        raise RuntimeError("No usable audio in evaluation loader.")
    return total_loss / total, correct / total


def balanced_subset(frame, samples_per_class: int, seed: int):
    """Deterministically select a balanced subset from one official partition."""
    parts = []
    for target in (0, 1):
        part = frame[frame["target"] == target]
        if len(part) < samples_per_class:
            raise ValueError(f"Partition has only {len(part)} samples for label {target}; need {samples_per_class}")
        parts.append(part.sample(n=samples_per_class, random_state=seed + target))
    import pandas as pd
    return pd.concat(parts, ignore_index=True).sample(frac=1.0, random_state=seed).reset_index(drop=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-dir", default="data/raw")
    ap.add_argument("--epochs", type=int, default=15)
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--num-workers", type=int, default=0,
                    help="parallel audio/Mel loader workers (0 disables parallel loading)")
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--model-path", default="models/voice_detector.pt")
    ap.add_argument("--config-path", default="models/model_config.json")
    ap.add_argument("--metrics-path", default="models/metrics.json")
    ap.add_argument("--evaluate-test", action="store_true",
                    help="evaluate the held-out test split after training (off by default)")
    ap.add_argument("--train-samples-per-class", type=int, default=None,
                    help="development mode: deterministic balanced count from official train only")
    ap.add_argument("--val-samples-per-class", type=int, default=None,
                    help="development mode: deterministic balanced count from official validation only")
    args = ap.parse_args()

    try:
        import torch
        from torch.utils.data import DataLoader
    except Exception:
        print("ERROR: torch is required for training. pip install -r requirements.txt", file=sys.stderr)
        sys.exit(2)

    from ml.dataset import load_manifest, speaker_independent_split
    from ml.model import VoiceCNN, model_config_for_n_mels

    try:
        df = load_manifest(args.raw_dir)
    except (FileNotFoundError, ValueError) as e:
        print(f"DATASET BLOCKER: {e}", file=sys.stderr)
        sys.exit(3)

    seed_everything(args.seed)
    mel = MelConfig()
    splits = speaker_independent_split(df)
    if (args.train_samples_per_class is None) != (args.val_samples_per_class is None):
        raise ValueError("train and validation subset sizes must be supplied together")
    if args.train_samples_per_class is not None:
        splits["train"] = balanced_subset(splits["train"], args.train_samples_per_class, args.seed)
        splits["val"] = balanced_subset(splits["val"], args.val_samples_per_class, args.seed + 1000)
        print("development subset: official train/validation partitions only")
    print(f"split strategy: {splits['strategy']}")
    print(f"train={len(splits['train'])} val={len(splits['val'])} test={len(splits['test'])}")

    loader_kwargs = {"batch_size": args.batch_size, "num_workers": args.num_workers,
                     "persistent_workers": args.num_workers > 0}
    train_dl = DataLoader(MelDataset(splits["train"], mel), shuffle=True, **loader_kwargs)
    val_dl = DataLoader(MelDataset(splits["val"], mel), shuffle=False, **loader_kwargs)

    model = VoiceCNN(model_config_for_n_mels(mel.n_mels))
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    loss_fn = torch.nn.BCEWithLogitsLoss()

    history = {"loss": [], "val_loss": [], "acc": [], "val_acc": []}
    best_val = float("inf")
    best_val_acc = 0.0
    best_state = None
    patience, bad = 4, 0
    start_time = time.perf_counter()
    for epoch in range(1, args.epochs + 1):
        model.train()
        tot, n, correct = 0.0, 0, 0
        for batch_idx, (xb, yb) in enumerate(train_dl, 1):
            opt.zero_grad()
            logits = model(xb)
            loss = loss_fn(logits, yb)
            loss.backward()
            opt.step()
            tot += loss.item() * len(xb)
            n += len(xb)
            correct += ((torch.sigmoid(logits) >= 0.5) == (yb >= 0.5)).sum().item()
            if batch_idx % 25 == 0 or batch_idx == len(train_dl):
                print(f"  epoch {epoch} [{batch_idx}/{len(train_dl)}] "
                      f"loss={tot / max(1, n):.4f} acc={correct / max(1, n):.4f}", flush=True)
        v_loss, v_acc = evaluate_loader(model, val_dl, loss_fn, torch)
        train_acc = correct / max(1, n)
        history["loss"].append(round(tot / max(1, n), 4))
        history["val_loss"].append(round(v_loss, 4))
        history["acc"].append(round(train_acc, 4))
        history["val_acc"].append(round(v_acc, 4))
        print(f"epoch {epoch}: loss={history['loss'][-1]} val_loss={v_loss:.4f} "
              f"acc={history['acc'][-1]} val_acc={history['val_acc'][-1]}", flush=True)
        if v_loss < best_val - 1e-4:
            best_val = v_loss
            best_val_acc = v_acc
            best_state = {k: v.cpu() for k, v in model.state_dict().items()}
            bad = 0
        else:
            bad += 1
            if bad >= patience:
                print(f"early stopping at epoch {epoch}")
                break

    training_duration = time.perf_counter() - start_time
    print(f"training completed in {training_duration:.2f}s ({training_duration / 60:.2f}m) "
          f"best_val_loss={best_val:.4f} best_val_acc={best_val_acc:.4f}", flush=True)

    os.makedirs(os.path.dirname(args.model_path) or ".", exist_ok=True)
    torch.save({"state_dict": best_state or model.state_dict()}, args.model_path)
    save_json(args.config_path, {"mel": {"sample_rate": mel.sample_rate, "n_mels": mel.n_mels,
                                         "n_fft": mel.n_fft, "hop_length": mel.hop_length,
                                         "fmax": mel.fmax, "window_seconds": mel.window_seconds},
                                 "model": model_config_for_n_mels(mel.n_mels),
                                 "labels": {"0": "genuine", "1": "ai_generated"}})
    metrics = {"history": history, "split_strategy": splits["strategy"],
               "n_train": len(splits["train"]), "n_val": len(splits["val"]), "n_test": len(splits["test"]),
               "development_subset": args.train_samples_per_class is not None,
               "training_duration_seconds": round(training_duration, 2),
               "best_val_loss": round(best_val, 4),
               "best_val_acc": round(best_val_acc, 4),
               "test_evaluated": False,
               "honesty_note": "Checkpoint selected only by validation loss; held-out test was not used."}
    # Kept opt-in so test evaluation is explicit and cannot influence selection.
    model.load_state_dict(best_state or model.state_dict())
    if args.evaluate_test:
        test_dl = DataLoader(MelDataset(splits["test"], mel), shuffle=False, **loader_kwargs)
        test_loss, test_acc = evaluate_loader(model, test_dl, loss_fn, torch)
        metrics.update({"test": {"loss": round(test_loss, 4), "accuracy": round(test_acc, 4)},
                        "test_evaluated": True,
                        "honesty_note": "Held-out test was evaluated only after checkpoint selection by validation loss."})
    save_json(args.metrics_path, metrics)
    save_training_plots(history)
    print(f"saved model -> {args.model_path}; metrics -> {args.metrics_path}")


if __name__ == "__main__":
    main()
