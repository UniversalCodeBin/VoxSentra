# Review 2 Demo

## TASK 3 — CORE COMPONENT PROOF
Real audio → preprocessing → Mel spectrogram → trained CNN → real probability → classification.

## TASK 4 — INPUT → PROCESSING → RESPONSE
INPUT: real audio file
PROCESSING: audio validation/mono/resample/VAD/trim → log-Mel → CNN (eval/no_grad) → risk engine
RESPONSE: prediction, ai_probability, confidence, voice_risk, final_risk_score, risk_level, recommendation

## Commands
1. Start backend (real model):
   `cd /run/media/white/New\ Volume/Projects/2K26/VoxSentra && MODEL_MODE=real uvicorn backend.main:app --port 8000`

2. Start frontend:
   `cd /run/media/white/New\ Volume/Projects/2K26/VoxSentra/VoxSentra-Voice-Security-Dashboard/artifacts/voxsentra && PORT=5173 BASE_PATH=/ pnpm run dev`

3. Run real inference test:
   `cd /run/media/white/New\ Volume/Projects/2K26/VoxSentra && MODEL_MODE=real python scripts/test_real_inference.py`

## Evidence
- Model: real (models/voice_detector.pt) loaded in lifespan when MODEL_MODE=real
- Genuine sample (5.00s, synthetic-trained checkpoint on 5s windows): real probabilities produced
- Backend `/api/v1/analyze` with MODEL_MODE=real returns processing.model_mode="real" and real numeric probabilities
- No hardcoded/fake results; inference uses torch.no_grad(), model.eval()
