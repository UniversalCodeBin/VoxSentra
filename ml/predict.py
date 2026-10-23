"""Single-file CLI prediction:  python -m ml.predict path/to/audio.wav"""
from __future__ import annotations
import argparse
import json
import sys


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    args = ap.parse_args()
    from backend.services.audio_processor import process_audio_file
    from backend.services.inference import load_model, predict

    st = load_model()
    if st["mode"] != "real":
        print(f"MODEL {st['mode'].upper()}: {st['detail']}", file=sys.stderr)
        if st["mode"] != "mock":
            sys.exit(3)
    try:
        proc = process_audio_file(args.audio, original_filename=args.audio)
    except Exception as e:  # noqa: BLE001
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(predict(proc.segments), indent=2))


if __name__ == "__main__":
    main()
