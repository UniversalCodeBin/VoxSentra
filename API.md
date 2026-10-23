# VoxSentra — Voice Integrity API Contract

Base URL (local dev): `http://localhost:8000`
Interactive docs: `/docs`, `/redoc`

The React dashboard lives in `src/`. During local development Vite proxies `/api`
and `/health` to this FastAPI service. The route signatures below reflect the FastAPI
implementation; the retained dashboard has not yet been fully reconciled with every
request/response field, so use `/docs` as the definitive running contract.

## 1. Auth

```http
POST /api/auth/login
Content-Type: application/json

{"username": "demo", "password": "secret123"}
```

Response `200`:

```json
{"access_token": "<jwt>", "token_type": "bearer", "expires_in": 3600}
```

Use `Authorization: Bearer <jwt>` on all `/api/v1/*` calls. Bad token → `401`.

```bash
curl -X POST localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"secret123"}'
```

## 2. Analyze full file

```http
POST /api/v1/analyze   (multipart/form-data, auth required)
```

| field | type | required | notes |
|---|---|---|---|
| `file` | binary | yes | wav/mp3/m4a/flac, ≥3 s, ≤25 MB default |
| `caller_known` | bool | no | default `true` |
| `urgent_request` | bool | no | default `false` |
| `sensitive_action` | bool | no | default `false` |
| `high_value_transaction` | bool | no | default `false` |
| `include_waveform` | bool | no | default `true` |
| `include_spectrogram` | bool | no | default `true` |

```bash
curl -X POST localhost:8000/api/v1/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@sample.wav;type=audio/wav" \
  -F "caller_known=false" -F "urgent_request=true" \
  -F "sensitive_action=true" -F "high_value_transaction=false"
```

Response `200` (abridged):

```json
{
  "analysis_id": 123,
  "prediction": "AI_GENERATED",
  "classification": "Likely AI-Generated",
  "ai_probability": 0.94,
  "genuine_probability": 0.06,
  "confidence": 0.94,
  "segment_count": 2,
  "segment_probabilities": [0.93, 0.95],
  "voice_risk": 94.0,
  "context_risk_adjustment": 4.0,
  "final_risk_score": 98.0,
  "risk_level": "CRITICAL",
  "replay_indicator": false,
  "replay_confidence": 0.21,
  "supporting_indicators": {
    "spectral_anomaly": 82.0, "mfcc_pattern": 76.0, "pitch_consistency": 68.0,
    "prosody_anomaly": 88.0, "energy_variation": 55.0, "pause_pattern": 31.0
  },
  "recommendation": "High-risk impersonation indicators detected...",
  "audio": {"duration_seconds": 5.2, "sample_rate": 16000},
  "waveform": {"sample_rate": 16000, "duration_seconds": 5.2, "points": 1200, "amplitude": [...]},
  "spectrogram": {"n_mels": 128, "frames": 313, "db_min": -80.0, "db_max": 0.0, "data": [[...]]},
  "processing": {"processing_time_ms": 842, "inference_time_ms": 113, "model_mode": "mock|real"},
  "created_at": "2026-10-08T12:00:00Z"
}
```

- `prediction`: `GENUINE | SUSPICIOUS | AI_GENERATED` (thresholds 0.35 / 0.70, configurable).
- `risk_level`: `LOW (0–29) | MEDIUM (30–59) | HIGH (60–79) | CRITICAL (80–100)`.
- `waveform.amplitude`: ≤1200 downsampled floats in [-1, 1]. Plot directly.
- `spectrogram.data`: downsampled ≤64×100 normalized 0–1 heatmap. Render with any heatmap.
- Confidence is the model's estimated probability — **not proof** of authenticity.

Errors (no stack traces): `400` bad audio/too short/no speech/unsupported,
`413` too large, `503` model unavailable, each with `{"detail": "..."}`.

## 3. Chunk (near-real-time mic) analysis

```http
POST /api/v1/analyze/chunk   (multipart/form-data, auth required)
```

Fields: `file` (3–5 s chunk), `session_id` (optional; server mints one),
`chunk_index`, plus the 4 context flags.

```bash
curl -X POST localhost:8000/api/v1/analyze/chunk \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@chunk.wav;type=audio/wav" \
  -F "session_id=abc" -F "chunk_index=3"
```

Response:

```json
{
  "session_id": "abc", "chunk_index": 3,
  "ai_probability": 0.81, "genuine_probability": 0.19,
  "rolling_ai_probability": 0.74,
  "voice_risk": 74.0, "context_risk_adjustment": 5.0,
  "final_risk_score": 79.0, "risk_level": "HIGH",
  "classification": "Likely AI-Generated", "prediction": "AI_GENERATED",
  "confidence": 0.74, "replay_indicator": false,
  "recommendation": "Potential voice impersonation detected...",
  "model_mode": "real"
}
```

Rolling probability = mean of last N chunk predictions (N=`CHUNK_ROLLING_WINDOW`, default 4).
`model_mode` is `real` or `mock` — show a demo/heuristic banner when it is `mock`.

## 4. History

```http
GET /api/v1/history?page=1&page_size=20
GET /api/v1/history/{analysis_id}
```

List response: `{items: [{id, classification, prediction, confidence, ai_probability, final_risk_score, risk_level, replay_indicator, created_at}], total, page, page_size}`.

Detail response (`GET /api/v1/history/{analysis_id}`):

```json
{
  "id": 123,
  "filename": "sample.wav",
  "classification": "Likely AI-Generated",
  "prediction": "AI_GENERATED",
  "ai_probability": 0.94,
  "genuine_probability": 0.06,
  "confidence": 0.94,
  "voice_risk": 94.0,
  "context_risk": 4.0,
  "final_risk": 98.0,
  "risk_level": "CRITICAL",
  "replay_indicator": false,
  "feature_summary": {"spectral_anomaly": 82.0, "mfcc_pattern": 76.0,
                     "pitch_consistency": 68.0, "prosody_anomaly": 88.0,
                     "energy_variation": 55.0, "pause_pattern": 31.0},
  "created_at": "2026-10-08T12:00:00Z"
}
```

Users only ever see their own rows (other users' ids → `404`).

## 5. Health

```http
GET /health
```

```json
{"status":"ok","service":"Voice Integrity API","database":"ok","model":"loaded|mock|unavailable","model_mode":"real|mock","model_detail":"...","version":"1.0.0"}
```

- `status` is `ok`, or `degraded` if the database check fails.
- `model` is `loaded` (real CNN), `mock` (deterministic heuristic) or `unavailable` (no model / torch missing).
- `model_mode` is the configured `MODEL_MODE` (`real` or `mock`). A `real` response
  requires a separately supplied, evaluated checkpoint; no checkpoint is bundled.
- `model_detail` carries a human-readable diagnostic (e.g. the missing-model path).

If `model` is `mock`, the banner in the UI should say demo/heuristic mode.
If `unavailable`, analysis returns `503` with a diagnostic message.

## 6. Frontend checklist

1. Login → store JWT in memory → `Authorization: Bearer`.
2. Upload form with 4 context toggles (defaults: known caller, nothing urgent).
3. Result panel: classification badge, probabilities, risk bar 0–100, level chip,
   replay note ("Possible replay" — never "confirmed"), supporting-indicator bars,
   recommendation text, waveform polyline, spectrogram heatmap.
4. Live mode: capture ~4 s chunks via MediaRecorder → POST `/chunk` with stable
   `session_id` → plot `rolling_ai_probability` + risk.
5. History page: `GET /history`, detail on click.
