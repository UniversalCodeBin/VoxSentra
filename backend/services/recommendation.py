"""Recommendation engine keyed on final risk level."""

RECOMMENDATIONS = {
    "LOW": "No significant synthetic-voice indicators detected. Continue normal verification procedures.",
    "MEDIUM": "Voice characteristics are inconclusive. Consider additional verification before sensitive actions.",
    "HIGH": "Potential voice impersonation detected. Do not rely on the voice alone. Perform independent verification.",
    "CRITICAL": ("High-risk impersonation indicators detected. Do not approve sensitive actions based solely "
                 "on this call. Use an independent callback or MFA verification."),
}


def recommend(risk_level: str) -> str:
    return RECOMMENDATIONS.get((risk_level or "").upper(), RECOMMENDATIONS["MEDIUM"])
