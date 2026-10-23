"""Shared ML utils: seeding, metrics, plot/artifact saving."""
from __future__ import annotations
import json
import os
import random

import numpy as np


def seed_everything(seed: int = 42) -> None:
    random.seed(seed)
    np.random.seed(seed)
    try:
        import torch
        torch.manual_seed(seed)
    except Exception:
        pass


def binary_metrics(y_true, y_prob) -> dict:
    from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score
    y_true = np.asarray(y_true, dtype=int)
    y_prob = np.asarray(y_prob, dtype=float)
    y_pred = (y_prob >= 0.5).astype(int)
    out = {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, y_pred, zero_division=0)), 4),
        "confusion_matrix": confusion_matrix(y_true, y_pred).tolist(),
    }
    try:
        out["roc_auc"] = round(float(roc_auc_score(y_true, y_prob)), 4)
    except Exception:
        out["roc_auc"] = None
    # AI-generated class (1) recall explicitly
    tp = int(((y_pred == 1) & (y_true == 1)).sum())
    fn = int(((y_pred == 0) & (y_true == 1)).sum())
    out["ai_recall"] = round(tp / max(1, tp + fn), 4)
    return out


def save_json(path: str, obj: dict) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, indent=2)


def save_training_plots(history: dict, reports_dir: str = "reports") -> list[str]:
    os.makedirs(reports_dir, exist_ok=True)
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    paths = []
    for key, title in (("loss", "training_loss"), ("val_loss", "validation_loss"),
                       ("acc", "training_accuracy"), ("val_acc", "validation_accuracy")):
        vals = history.get(key)
        if not vals:
            continue
        plt.figure()
        plt.plot(vals)
        plt.title(title)
        plt.xlabel("epoch")
        plt.ylabel(key)
        p = os.path.join(reports_dir, f"{title}.png")
        plt.savefig(p)
        plt.close()
        paths.append(p)
    return paths
