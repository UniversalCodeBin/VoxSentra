"""Dataset pipeline.

Expected layout (documented in data/README.md):
  audio files + data/raw/metadata.csv(columns: file,speaker,label[,split])

- label in {genuine, real, bonafide, 0} -> 0 ; {fake, spoof, synthetic, ai, 1} -> 1
- When a valid `split` column supplies train/val/test, preserve those explicit
  partitions after asserting their speakers are disjoint. Otherwise group by
  speaker, with a documented stratified-file fallback only for tiny corpora.

If no dataset is present, train/evaluate exit with a clear blocker message
instead of fabricating a model (per PRD honesty rule).
"""
from __future__ import annotations
import os
import numpy as np
import pandas as pd

LABEL_NEGATIVE = {"genuine", "real", "bonafide", "bonafied", "human", "0", "false"}
LABEL_POSITIVE = {"fake", "spoof", "synthetic", "ai", "ai_generated", "tts", "vc", "1", "true"}


def label_to_int(label) -> int:
    s = str(label).strip().lower()
    if s in LABEL_NEGATIVE:
        return 0
    if s in LABEL_POSITIVE:
        return 1
    raise ValueError(f"Unknown label: {label!r}")


def find_metadata(raw_dir: str = "data/raw") -> str | None:
    for name in ("metadata.csv", "protocol.csv", "labels.csv"):
        p = os.path.join(raw_dir, name)
        if os.path.exists(p):
            return p
    return None


def scan_audio_files(raw_dir: str = "data/raw") -> pd.DataFrame:
    rows = []
    for root, _, files in os.walk(raw_dir):
        for f in files:
            if f.lower().endswith((".wav", ".flac", ".mp3", ".m4a")):
                full = os.path.join(root, f)
                speaker = os.path.basename(os.path.dirname(full))
                rows.append({"file": full, "speaker": speaker})
    return pd.DataFrame(rows)


def load_manifest(raw_dir: str = "data/raw") -> pd.DataFrame:
    meta = find_metadata(raw_dir)
    if meta is None:
        raise FileNotFoundError(
            f"No dataset found in {raw_dir}/. Add audio + metadata.csv "
            "(columns: file,speaker,label). See data/README.md. "
            "Recommended: ASVspoof 2019 LA (https://www.asvspoof.org/) for genuine/spoof speech."
        )
    df = pd.read_csv(meta)
    cols = {c.lower(): c for c in df.columns}
    if "file" not in cols or "label" not in cols:
        raise ValueError("metadata.csv must contain at least columns: file,label")
    df = df.rename(columns={cols["file"]: "file", cols["label"]: "label"})
    speaker_col = cols.get("speaker")
    df["speaker"] = df[speaker_col] if speaker_col else df["file"].apply(lambda p: os.path.basename(os.path.dirname(str(p))))
    df["target"] = df["label"].apply(label_to_int)
    # Prefer paths relative to the project working directory. This permits a
    # manifest in data/raw to reference a project-local corpus such as LA/...
    # without embedding a machine-specific absolute path.
    def resolve_path(value) -> str:
        path = str(value)
        if os.path.isabs(path) or os.path.exists(path):
            return path
        return os.path.join(raw_dir, path)

    df["file"] = df["file"].apply(resolve_path)
    missing = df[~df["file"].apply(os.path.exists)]
    if not missing.empty:
        raise FileNotFoundError(f"{len(missing)} listed files missing, e.g. {missing.iloc[0]['file']}")
    split_col = cols.get("split")
    if split_col:
        df["split"] = df[split_col].astype(str).str.strip().str.lower()
    columns = ["file", "speaker", "label", "target"]
    if split_col:
        columns.append("split")
    return df[columns]


def speaker_independent_split(df: pd.DataFrame, val_ratio=0.15, test_ratio=0.15,
                              seed: int = 42) -> dict:
    """Group speakers into train/val/test (no speaker across splits). Falls back to
    stratified split with strategy flag when speaker metadata is degenerate."""
    # Official corpus partitions take precedence. In particular ASVspoof LA
    # evaluation data must never be folded into a training split.
    if "split" in df.columns:
        aliases = {"train": "train", "training": "train", "val": "val",
                   "validation": "val", "dev": "val", "development": "val",
                   "test": "test", "eval": "test", "evaluation": "test"}
        normalized = df["split"].map(aliases)
        if normalized.notna().all() and set(normalized.unique()) == {"train", "val", "test"}:
            result = {name: df[normalized == name].copy() for name in ("train", "val", "test")}
            speaker_sets = {name: set(part["speaker"]) for name, part in result.items()}
            if (speaker_sets["train"] & speaker_sets["val"] or
                    speaker_sets["train"] & speaker_sets["test"] or
                    speaker_sets["val"] & speaker_sets["test"]):
                raise ValueError("Explicit dataset splits are not speaker-independent")
            result["strategy"] = "official_protocol_partitions"
            return result

    rng = np.random.RandomState(seed)
    speakers = sorted(df["speaker"].unique().tolist())
    strategy = "speaker_independent"
    if len(speakers) < 6:
        strategy = "stratified_file_fallback (fewer than 6 speakers; speaker split not meaningful)"
        from sklearn.model_selection import train_test_split
        train, rest = train_test_split(df, test_size=val_ratio + test_ratio,
                                       stratify=df["target"], random_state=seed)
        val, test = train_test_split(rest, test_size=test_ratio / (val_ratio + test_ratio),
                                     stratify=rest["target"], random_state=seed)
        return {"train": train, "val": val, "test": test, "strategy": strategy}
    rng.shuffle(speakers)
    n = len(speakers)
    n_test = max(1, int(n * test_ratio))
    n_val = max(1, int(n * val_ratio))
    test_sp = set(speakers[:n_test])
    val_sp = set(speakers[n_test:n_test + n_val])
    test = df[df["speaker"].isin(test_sp)]
    val = df[df["speaker"].isin(val_sp)]
    train = df[~df["speaker"].isin(test_sp | val_sp)]
    return {"train": train, "val": val, "test": test, "strategy": strategy}
