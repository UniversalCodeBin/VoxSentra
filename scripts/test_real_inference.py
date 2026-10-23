#!/usr/bin/env python
import os, sys, json
sys.path.insert(0, '.')
os.environ.setdefault('MODEL_MODE','real')

from backend.services import audio_processor, inference
from backend.services.risk_engine import compute_risk
from backend.services.recommendation import recommend

def main():
    inference.load_model()
    st = inference.get_inference_state()
    if st['mode'] != 'real' or st['model'] is None:
        print('FAIL: MODEL_MODE=real but model not real/loaded', file=sys.stderr)
        sys.exit(1)
    for name in ['demo/genuine_sample.wav','demo/spoof_sample.wav']:
        if not os.path.exists(name):
            print(f'FAIL: missing {name}', file=sys.stderr); sys.exit(2)
        try:
            proc = audio_processor.process_audio_file(name)
            pred = inference.predict(proc.segments)
            risk = compute_risk(pred['ai_probability'])
            print(json.dumps({
                'file': name,
                'model_mode': 'real',
                'ai_probability': pred['ai_probability'],
                'prediction': risk.prediction,
                'risk_level': risk.risk_level,
                'final_risk_score': risk.final_risk_score,
                'recommendation': recommend(risk.risk_level)[:60]
            }))
        except Exception as e:
            print(f'FAIL: {name} -> {e}', file=sys.stderr); sys.exit(3)

if __name__ == '__main__':
    main()
