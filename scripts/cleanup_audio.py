"""Remove stale temp audio:  python scripts/cleanup_audio.py"""
import sys

sys.path.insert(0, ".")

from backend.config import get_settings
from backend.services.cleanup import purge_stale_uploads


def main() -> None:
    s = get_settings()
    n = purge_stale_uploads(s.UPLOAD_DIR, s.AUDIO_RETENTION_SECONDS)
    print(f"removed {n} stale file(s) from {s.UPLOAD_DIR}")


if __name__ == "__main__":
    main()
