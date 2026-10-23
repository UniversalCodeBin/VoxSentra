"""History APIs: list + detail, strictly scoped to the authenticated user."""
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend import models
from backend.api.auth import get_current_user
from backend.database import get_db
from backend.schemas import HistoryDetailResponse, HistoryItem, HistoryListResponse

router = APIRouter()


@router.get("/history", response_model=HistoryListResponse)
def list_history(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                 db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    q = db.query(models.Analysis).filter(models.Analysis.user_id == user.id)
    total = q.count()
    rows = (q.order_by(models.Analysis.created_at.desc())
            .offset((page - 1) * page_size).limit(page_size).all())
    items = [HistoryItem(id=r.id, classification=_human(r.classification), prediction=r.classification,
                         confidence=r.confidence, ai_probability=r.ai_probability,
                         final_risk_score=r.final_risk, risk_level=r.risk_level,
                         replay_indicator=bool(r.replay_indicator), created_at=r.created_at) for r in rows]
    return HistoryListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/history/{analysis_id}", response_model=HistoryDetailResponse)
def history_detail(analysis_id: int, db: Session = Depends(get_db),
                   user: models.User = Depends(get_current_user)):
    r = db.query(models.Analysis).filter(models.Analysis.id == analysis_id,
                                         models.Analysis.user_id == user.id).first()
    if r is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    try:
        summary = json.loads(r.feature_summary or "{}")
    except Exception:
        summary = {}
    return HistoryDetailResponse(
        id=r.id, filename=r.filename, classification=_human(r.classification),
        prediction=r.classification, ai_probability=r.ai_probability,
        genuine_probability=r.genuine_probability, confidence=r.confidence,
        voice_risk=r.voice_risk, context_risk=r.context_risk, final_risk=r.final_risk,
        risk_level=r.risk_level, replay_indicator=bool(r.replay_indicator),
        feature_summary=summary, created_at=r.created_at)


def _human(pred: str) -> str:
    return {"GENUINE": "Likely Genuine", "SUSPICIOUS": "Suspicious",
            "AI_GENERATED": "Likely AI-Generated"}.get(pred, pred)
