"""Prepare and validate ASVspoof 2019 Logical Access metadata.

This script consumes only the official CM protocol files. It never derives a
label or speaker from an audio filename and it never modifies source audio.
"""
from __future__ import annotations

import argparse
import csv
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PARTITIONS = {
    "train": ("ASVspoof2019.LA.cm.train.trn.txt", "ASVspoof2019_LA_train"),
    "val": ("ASVspoof2019.LA.cm.dev.trl.txt", "ASVspoof2019_LA_dev"),
    "test": ("ASVspoof2019.LA.cm.eval.trl.txt", "ASVspoof2019_LA_eval"),
}
VALID_EXTENSIONS = {".flac", ".wav", ".mp3", ".m4a"}


def project_path(path: str | Path) -> Path:
    path = Path(path)
    return path if path.is_absolute() else PROJECT_ROOT / path


def parse_protocol(path: Path, split: str, audio_dir: Path):
    rows, invalid = [], []
    if not path.is_file():
        return rows, [(0, f"missing protocol: {path}")]
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        fields = line.split()
        if len(fields) != 5 or fields[-1] not in {"bonafide", "spoof"}:
            invalid.append((line_no, line.rstrip()))
            continue
        speaker, utterance, _, _, protocol_label = fields
        rows.append({
            "file": (audio_dir / f"{utterance}.flac").relative_to(PROJECT_ROOT).as_posix(),
            "speaker": speaker,
            "label": "0" if protocol_label == "bonafide" else "1",
            "split": split,
        })
    return rows, invalid


def collect(dataset_root: Path):
    protocols = dataset_root / "ASVspoof2019_LA_cm_protocols"
    rows, invalid = [], []
    for split, (protocol_name, audio_name) in PARTITIONS.items():
        parsed, bad = parse_protocol(protocols / protocol_name, split, dataset_root / audio_name / "flac")
        rows.extend(parsed)
        invalid.extend(bad)
    return rows, invalid


def write_metadata(rows, metadata_path: Path) -> None:
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    with metadata_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["file", "speaker", "label", "split"])
        writer.writeheader()
        writer.writerows(rows)


def audio_status(path: Path):
    if path.suffix.lower() not in VALID_EXTENSIONS:
        return "invalid extension"
    if not path.is_file():
        return "missing"
    if path.stat().st_size == 0:
        return "zero-byte"
    if path.suffix.lower() == ".flac":
        # ASVspoof LA is FLAC. Read and validate its mandatory STREAMINFO
        # header directly, avoiding a full decode of the corpus.
        try:
            with path.open("rb") as handle:
                header = handle.read(42)
            if len(header) < 42 or header[:4] != b"fLaC" or (header[4] & 0x7F) != 0:
                return "invalid FLAC header"
            streaminfo = header[8:42]
            packed = int.from_bytes(streaminfo[10:18], "big")
            sample_rate = packed >> 44
            total_samples = packed & ((1 << 36) - 1)
            if sample_rate <= 0 or total_samples <= 0:
                return "zero duration"
        except OSError as exc:
            return f"unreadable: {exc}"
        return None
    try:
        import soundfile as sf
        info = sf.info(str(path))
        if info.frames <= 0 or info.samplerate <= 0:
            return "zero duration"
    except Exception as exc:
        return f"unreadable: {exc}"
    return None


def print_report(rows, invalid, check_audio: bool, audio_rows=None) -> bool:
    file_counts = Counter(row["file"] for row in rows)
    duplicate_files = sum(count - 1 for count in file_counts.values() if count > 1)
    row_counts = Counter((row["file"], row["speaker"], row["label"], row["split"]) for row in rows)
    duplicate_rows = sum(count - 1 for count in row_counts.values() if count > 1)
    issues = []
    if check_audio:
        audio_rows = rows if audio_rows is None else audio_rows
        print(f"Checking readable, non-zero audio headers for {len(audio_rows)} protocol files...", flush=True)
        # Header reads are independent and I/O-bound; bounded parallelism keeps
        # full-corpus validation practical without decoding/preprocessing audio.
        with ThreadPoolExecutor(max_workers=32) as pool:
            for row, problem in zip(audio_rows, pool.map(lambda row: audio_status(PROJECT_ROOT / row["file"]), audio_rows)):
                if problem:
                    issues.append((row["file"], problem))
    labels = Counter(row["label"] for row in rows)
    print("ASVspoof 2019 LA validation")
    print(f"Total protocol audio files: {len(rows)}")
    print(f"Genuine (label 0): {labels['0']}")
    print(f"Spoof (label 1): {labels['1']}")
    print(f"Number of speakers: {len(set(row['speaker'] for row in rows))}")
    print(f"Missing/unreadable/invalid audio: {len(issues)}")
    print(f"Invalid protocol rows: {len(invalid)}")
    print(f"Duplicate files: {duplicate_files}")
    print(f"Duplicate metadata rows: {duplicate_rows}")
    for split in ("train", "val", "test"):
        part = [row for row in rows if row["split"] == split]
        part_labels = Counter(row["label"] for row in part)
        print(f"{split.title()}: files={len(part)} speakers={len(set(row['speaker'] for row in part))} "
              f"genuine={part_labels['0']} spoof={part_labels['1']}")
    speakers = {split: {row["speaker"] for row in rows if row["split"] == split}
                for split in ("train", "val", "test")}
    overlaps = {"train_val": speakers["train"] & speakers["val"],
                "train_test": speakers["train"] & speakers["test"],
                "val_test": speakers["val"] & speakers["test"]}
    print("Speaker overlap: " + ", ".join(f"{name}={len(value)}" for name, value in overlaps.items()))
    if issues:
        print("First audio issue:", issues[0])
    if invalid:
        print("First invalid protocol row:", invalid[0])
    return not (issues or invalid or duplicate_files or duplicate_rows or any(overlaps.values()))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-root", default="LA", help="ASVspoof LA directory, relative to project root")
    parser.add_argument("--metadata", default="data/raw/metadata.csv", help="output metadata path, relative to project root")
    parser.add_argument("--validate", action="store_true", help="validate official protocols and referenced audio")
    parser.add_argument("--no-audio-check", action="store_true", help="skip per-file readability/duration checks")
    parser.add_argument("--audio-start", type=int, default=0, help=argparse.SUPPRESS)
    parser.add_argument("--audio-end", type=int, help=argparse.SUPPRESS)
    args = parser.parse_args()
    rows, invalid = collect(project_path(args.dataset_root))
    if invalid and not rows:
        raise SystemExit(f"Cannot prepare metadata: {invalid[0][1]}")
    if not args.validate:
        write_metadata(rows, project_path(args.metadata))
        print(f"Wrote {len(rows)} rows to {project_path(args.metadata).relative_to(PROJECT_ROOT)}")
    if args.validate:
        audio_rows = rows[args.audio_start:args.audio_end]
        raise SystemExit(0 if print_report(rows, invalid, not args.no_audio_check, audio_rows) else 1)


if __name__ == "__main__":
    main()
