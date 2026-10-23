import numpy as np
import pytest

torch = pytest.importorskip("torch", reason="torch not installed") if False else None


def test_cnn_forward_if_torch_available():
    try:
        import torch as _t
    except Exception:
        pytest.skip("torch not installed")
    from ml.model import VoiceCNN, model_config_for_n_mels
    m = VoiceCNN(model_config_for_n_mels(128))
    m.eval()
    x = _t.randn(2, 1, 128, 32)
    with _t.no_grad():
        out = m(x)
    assert out.shape == (2,)


def test_inference_probability_range_mock():
    from backend.config import get_settings
    get_settings.cache_clear()
    import os
    os.environ["MODEL_MODE"] = "mock"
    get_settings.cache_clear()
    from backend.services import inference
    st = inference.load_model()
    assert st["mode"] == "mock"
    x = np.random.RandomState(0).randn(16000 * 5).astype(np.float32) * 0.3
    p, _ = inference.predict_segment(x)
    assert 0.0 <= p <= 1.0
    out = inference.predict([x, x])
    assert 0.0 <= out["ai_probability"] <= 1.0
    assert out["segment_count"] == 2
    # deterministic
    p2, _ = inference.predict_segment(x)
    assert p == p2


def test_mock_mode_reported_in_health():
    from backend.config import get_settings
    get_settings.cache_clear()
    import os
    os.environ["MODEL_MODE"] = "mock"
    get_settings.cache_clear()
    from backend.services import inference
    inference.load_model()
    assert inference.is_mock_mode() is True
