"""CNN model for Mel-spectrogram binary classification (0=genuine, 1=AI).

Kept import-safe: torch imported lazily so backend boots without it.
"""
from __future__ import annotations

MODE_INPUT_NOTE = "input: (batch, 1, n_mels, frames) log-mel spectrogram"


def model_config_for_n_mels(n_mels: int = 128) -> dict:
    return {"n_mels": int(n_mels), "n_channels": [32, 64, 128], "dropout": 0.3}


try:
    import torch.nn as _nn  # noqa: F401

    class VoiceCNN(_nn.Module):
        def __init__(self, cfg=None):
            super().__init__()
            cfg = cfg or model_config_for_n_mels()
            ch = cfg["n_channels"]
            drop = cfg.get("dropout", 0.3)
            self.features = _nn.Sequential(
                _nn.Conv2d(1, ch[0], 3, padding=1), _nn.BatchNorm2d(ch[0]), _nn.ReLU(), _nn.MaxPool2d(2),
                _nn.Conv2d(ch[0], ch[1], 3, padding=1), _nn.BatchNorm2d(ch[1]), _nn.ReLU(), _nn.MaxPool2d(2),
                _nn.Conv2d(ch[1], ch[2], 3, padding=1), _nn.BatchNorm2d(ch[2]), _nn.ReLU(), _nn.MaxPool2d(2),
                _nn.AdaptiveAvgPool2d((4, 4)),
            )
            self.head = _nn.Sequential(
                _nn.Flatten(), _nn.Linear(ch[2] * 16, 64), _nn.ReLU(),
                _nn.Dropout(drop), _nn.Linear(64, 1),
            )

        def forward(self, x):
            return self.head(self.features(x)).squeeze(1)
except Exception:  # pragma: no cover - torch absent
    class VoiceCNN:  # type: ignore
        def __init__(self, *a, **k):
            raise ImportError("torch is required for VoiceCNN")
