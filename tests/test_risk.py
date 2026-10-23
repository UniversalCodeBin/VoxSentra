from backend.services.risk_engine import classify, compute_risk, risk_level_for


def test_low_voice_low_context_is_low():
    r = compute_risk(0.1)
    assert r.risk_level == "LOW"
    assert r.prediction == "GENUINE"


def test_high_voice_low_context_is_high_or_critical():
    r = compute_risk(0.75)
    assert r.risk_level in ("HIGH", "CRITICAL")


def test_high_voice_high_context_is_critical():
    r = compute_risk(0.75, caller_known=False, urgent_request=True,
                     sensitive_action=True, high_value_transaction=True)
    assert r.risk_level == "CRITICAL"
    assert r.final_risk_score <= 100


def test_boundaries():
    assert risk_level_for(29) == "LOW"
    assert risk_level_for(30) == "MEDIUM"
    assert risk_level_for(59) == "MEDIUM"
    assert risk_level_for(60) == "HIGH"
    assert risk_level_for(79) == "HIGH"
    assert risk_level_for(80) == "CRITICAL"
    assert risk_level_for(100) == "CRITICAL"


def test_classification_thresholds():
    assert classify(0.10)[0] == "GENUINE"
    assert classify(0.50)[0] == "SUSPICIOUS"
    assert classify(0.90)[0] == "AI_GENERATED"
    # exact boundaries per spec
    assert classify(0.35)[0] == "SUSPICIOUS"
    assert classify(0.70)[0] == "AI_GENERATED"


def test_context_capped_and_never_above_100():
    r = compute_risk(0.99, caller_known=False, urgent_request=True,
                     sensitive_action=True, high_value_transaction=True, replay_indicator=True)
    assert r.final_risk_score <= 100.0
    assert r.context_risk_adjustment <= 22.0
