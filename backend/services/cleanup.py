"""Temp-audio cleanup: delete file even on failure; purge stale files."""
import logging
import os
import time

logger = logging.getLogger(__name__)


def safe_delete(path: str) -> bool:
    try:
        if path and os.path.isfile(path):
            os.remove(path)
            return True
        return False
    except OSError as e:
        logger.warning("cleanup failed for %s: %s", path, e)
        return False


def purge_stale_uploads(upload_dir: str, retention_seconds: int) -> int:
    removed = 0
    try:
        now = time.time()
        for name in os.listdir(upload_dir):
            p = os.path.join(upload_dir, name)
            if not os.path.isfile(p) or name == ".gitkeep":
                continue
            try:
                if now - os.path.getmtime(p) > retention_seconds:
                    os.remove(p)
                    removed += 1
            except OSError:
                continue
    except FileNotFoundError:
        pass
    return removed
