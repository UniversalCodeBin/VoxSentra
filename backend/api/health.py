"""Health/status endpoint — never lies about model state."""
from fastapi import APIRouter

from backend.config import get_settings
from backend.services import inference

router = APIRouter()


@router.get("/health")
def health():
    from sqlalchemy import text
    from backend.database import engine
    s = get_settings()
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "unavailable"
    st = inference.get_inference_state()
    mode = st.get("mode", "uninitialized")
    model_status = {"real": "loaded", "mock": "mock", "unavailable": "unavailable"}.get(mode, mode)
    return {
        "status": "degraded" if db_status != "ok" else "ok",
        "service": s.APP_NAME,
        "database": db_status,
        "model": model_status,
        "model_mode": mode if mode != "uninitialized" else ("mock" if s.MODEL_MODE == "mock" else "real"),
        "model_detail": st.get("detail", ""),
        "version": s.VERSION,
    }
