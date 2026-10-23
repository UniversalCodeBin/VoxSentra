"""Risk engine: voice risk + contextual adjustment -> final 0-100 + level + classification."""
from dataclasses import dataclass

from backend.config import get_settings

CLASS_GENUINE = "GENUINE"
CLASS_SUSPICIOUS = "SUSPICIOUS"
CLASS_AI = "AI_GENERATED"

HUMAN_LABELS = {
    CLASS_GENUINE: "Likely Genuine",
    CLASS_SUSPICIOUS: "Suspicious",
    CLASS_AI: "Likely AI-Generated",
}


@dataclass
class RiskResult:
    voice_risk: float
    context_risk_adjustment: float
    final_risk_score: float
    risk_level: str
    prediction: str
    classification: str


def classify(ai_probability: float) -> tuple[str, str]:
    s = get_settings()
    p = max(0.0, min(1.0, float(ai_probability)))
    if p >= s.AI_THRESHOLD:
        return CLASS_AI, HUMAN_LABELS[CLASS_AI]
    if p >= s.SUSPICIOUS_THRESHOLD:
        return CLASS_SUSPICIOUS, HUMAN_LABELS[CLASS_SUSPICIOUS]
    return CLASS_GENUINE, HUMAN_LABELS[CLASS_GENUINE]


def risk_level_for(score: float) -> str:
    s = get_settings()
    v = max(0.0, min(100.0, float(score)))
    if v <= s.RISK_LOW_MAX:
        return "LOW"
    if v <= s.RISK_MEDIUM_MAX:
        return "MEDIUM"
    if v <= s.RISK_HIGH_MAX:
        return "HIGH"
    return "CRITICAL"


def context_adjustment(caller_known: bool = True, urgent_request: bool = False,
                       sensitive_action: bool = False, high_value_transaction: bool = False,
                       replay_indicator: bool = False) -> float:
    s = get_settings()
    adj = 0.0
    if not caller_known:
        adj += 5
    if urgent_request:
        adj += 5
    if sensitive_action:
        adj += 5
    if high_value_transaction:
        adj += 7
    if replay_indicator:
        adj += 4
    return min(adj, float(s.CONTEXT_CAP))


def compute_risk(ai_probability: float, caller_known: bool = True, urgent_request: bool = False,
                 sensitive_action: bool = False, high_value_transaction: bool = False,
                 replay_indicator: bool = False) -> RiskResult:
    p = max(0.0, min(1.0, float(ai_probability)))
    voice_risk = round(p * 100.0, 1)
    adj = context_adjustment(caller_known, urgent_request, sensitive_action,
                             high_value_transaction, replay_indicator)
    final = round(max(0.0, min(100.0, voice_risk + adj)), 1)
    level = risk_level_for(final)
    pred, human = classify(p)
    return RiskResult(voice_risk=voice_risk, context_risk_adjustment=round(adj, 1),
                      final_risk_score=final, risk_level=level,
                      prediction=pred, classification=human)
