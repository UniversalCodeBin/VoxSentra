# VoxSentra — Voice Integrity API (backend + AI/ML)

Privacy-aware voice-security application: a React/Vite dashboard backed by a FastAPI
service that detects likely synthetic/suspicious speech,
adds contextual fraud signals, scores 0–100 risk, and recommends independent
verification. Decision-support only — never proof, never auto-blocking.

## Architecture

```text
FastAPI (backend/main.py)
├── /api/auth      login (JWT)
├── /api/v1/analyze (+/chunk)   audio -> preprocess -> mel -> CNN -> risk -> SQLite
├── /api/v1/history             per-user history
└── /health                     db + model status (never lies)
services: audio_processor | feature_extractor | inference (loaded once) |
          risk_engine | replay_detector | recommendation | cleanup
ml/: dataset (speaker-independent split) | model (CNN+Mel) | train | evaluate | predict
SQLite via SQLAlchemy. Raw audio: temp file -> analyzed -> deleted in `finally`.

React + Vite (`src/`)
├── login, analysis workspace, history, live-monitor, and dashboard views
└── Vite development proxy to the FastAPI service at `http://127.0.0.1:8000`
```

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # set JWT_SECRET_KEY!
python scripts/create_user.py --username demo --password <secret>
uvicorn backend.main:app --reload   # http://localhost:8000/docs
```

In a second terminal, start the dashboard:

```bash
npm install
npm run dev
```

The frontend uses Vite's local `/api` and `/health` proxy. `npm run dev:legacy-server`
starts the retained legacy Express demo server instead; it requires `JWT_SECRET` in its
environment and is not the FastAPI production path.

Torch/librosa/soundfile are in requirements but **optional at runtime**: without
them the API boots in `MODEL_MODE=mock` (deterministic heuristic, reported in
`/health`) so auth/audio/risk/history stay testable.

## Environment

See `.env.example`. Key knobs: `MODEL_MODE=real|mock`, `AI_THRESHOLD=0.70`,
`SUSPICIOUS_THRESHOLD=0.35`, risk bands `RISK_*_MAX`, `MAX_AUDIO_SIZE_MB`,
`MIN_AUDIO_DURATION_SECONDS`, `ANALYSIS_WINDOW_SECONDS`, `CORS_ORIGINS`.

## Database

SQLite (`DATABASE_URL`). Tables auto-created on startup: `users(id, username unique,
password_hash, created_at)`, `analyses(id, user_id, filename, classification,
ai_probability, genuine_probability, confidence, voice_risk, context_risk,
final_risk, risk_level, replay_indicator, feature_summary, created_at)`.
No audio columns, ever.

## Model

- CNN + log-Mel (`ml/model.py`), `BCEWithLogitsLoss`, single logit → sigmoid.
- Preprocessing single source of truth: `backend/services/feature_extractor.py`
  (librosa if present, numpy/scipy fallback otherwise); exact config saved to
  `models/model_config.json` at train time and reloaded at inference.
- Dataset: see `data/README.md` (WaveFake / ASVspoof recommended; manifest
  `data/raw/metadata.csv`). Split is speaker-independent when ≥6 speakers.
- Status honesty: `/health` reports `loaded | mock | unavailable`; mock mode is
  opt-in (`MODEL_MODE=mock`) and exposed in every analysis response.

No dataset, raw recording, or model checkpoint is published in this consolidated
repository. A local checkpoint existed in the source workspace but has only
development/validation metadata and no held-out test evaluation, so it was excluded.
Without an independently obtained and evaluated checkpoint, use `MODEL_MODE=mock` for
plumbing tests; do not represent its output as trained-model inference.

## Commands

```bash
pip install -r requirements.txt
python scripts/download_dataset.py --list
python scripts/download_dataset.py --synthetic-demo   # smoke test only
python -m ml.train --epochs 15                        # needs real dataset + torch
python -m ml.evaluate
python -m ml.predict sample.wav
python scripts/create_user.py --username demo
uvicorn backend.main:app --host 0.0.0.0 --port 8000
pytest
```

## Privacy

Upload → `temp_audio/<uuid>.<ext>` → analysis → metadata persisted → file deleted
in a `finally` block (success or failure). `scripts/cleanup_audio.py` purges files
older than `AUDIO_RETENTION_SECONDS`. Tests in `tests/test_privacy.py` assert this.

## Repository layout

```text
src/             React/TypeScript dashboard
backend/         FastAPI API, authentication, audio processing, persistence
ml/              CNN model definition, train/evaluate/predict commands
scripts/         dataset and local-user utilities
tests/           API, privacy, security, and model workflow tests
configs/         application configuration assets
docs/             supporting project documentation
data/README.md    dataset acquisition and preparation guidance
```

## Limitations (read before demoing)

- No dataset is bundled; without one, `ml.train` exits with a blocker message and
  no model/metrics are fabricated. Mock mode exists for plumbing demos only.
- Classification thresholds (0.35/0.70) are application heuristics, not science.
- Confidence = model probability, not proof. Replay output is `POSSIBLE_REPLAY`
  at best. Language-independent acoustics; no Tamil-specific evaluation exists
  unless Tamil data is added and evaluated. No auto-blocking of transactions.
- The retained dashboard was built against an earlier mock-server contract. Its
  FastAPI proxy is configured, but endpoint/request and response schema alignment
  requires further UI integration work before end-to-end dashboard inference can be
  claimed as verified.
```

## Test

```bash
pytest -q
```
