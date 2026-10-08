export type ContextType = 'unknown' | 'urgent_request' | 'sensitive_info' | 'high_value_transfer';

export type VerdictType = 'GENUINE' | 'SUSPICIOUS' | 'AI-GENERATED';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface PreprocessingMetadata {
  file_format: string;
  file_size_bytes: number;
  duration_seconds: number;
  validation: {
    status: 'VALID' | 'INVALID';
    checks: string[];
    max_size_bytes: number;
    supported_formats: string[];
  };
  decode: {
    success: boolean;
    format: string;
    bit_depth: number;
    codec: string;
  };
  resample: {
    input_sample_rate_hz: number;
    target_sample_rate_hz: number;
    ratio: string;
    is_resampled: boolean;
  };
  mono: {
    input_channels: number;
    target_channels: number;
    is_already_mono: boolean;
  };
  normalize: {
    completed: boolean;
    peak_amplitude_before: number;
    peak_amplitude_after: number;
    method: string;
  };
  vad: {
    completed: boolean;
    speech_detected: boolean;
    speech_duration_seconds: number;
    removed_silence_seconds: number;
    speech_percentage: number;
  };
  segmentation: {
    completed: boolean;
    segment_duration_seconds: number;
    segment_count: number;
    active_segment_index: number;
    segments: Array<{
      index: number;
      start_seconds: number;
      end_seconds: number;
      speech_frames: number;
    }>;
  };
  mel_spectrogram: {
    completed: boolean;
    mel_bins: number;
    time_frames: number;
    f_min_hz: number;
    f_max_hz: number;
    window_type: string;
  };
  cnn: {
    completed: boolean;
    model_name: string;
    input_dimensions: string;
    ai_probability: number;
    verdict: string;
  };
}

export interface AnalysisRecord {
  id: string;
  timestamp: string;
  audio_filename: string;
  file_size_bytes: number;
  duration_seconds: number;
  model_mode: 'real';
  verdict: VerdictType;
  confidence: number;
  ai_probability: number;
  risk_score: number;
  risk_level: RiskLevel;
  context: ContextType;
  contributors: {
    voice_authenticity: number;
    context: number;
    replay_indicator: number;
  };
  waveform_peaks: number[];
  mel_spectrogram: {
    frequencies: number[];
    time_frames: number;
    mel_bins: number;
    matrix: number[][];
    available: boolean;
  };
  evidence: {
    model_evidence: string[];
    dsp_indicators: string[];
    contextual_factors: string[];
  };
  recommendation: {
    action: string;
    details: string;
  };
  preprocessing?: PreprocessingMetadata;
}

export interface SystemHealth {
  status: string;
  model_mode: 'real' | 'mock' | 'unavailable';
  detection_engine: string;
  api_status: string;
  database: string;
  version: string;
  sample_rate_hz: number;
  timestamp: string;
}

export interface AuthUser {
  email: string;
  name: string;
  role: string;
  organization: string;
}

export interface LiveDetectionItem {
  id: string;
  timestamp: string;
  verdict: VerdictType;
  ai_probability: number;
  risk_score: number;
  risk_level: RiskLevel;
  confidence: number;
  waveform_peak?: number;
  evidence?: {
    model_evidence?: string[];
    dsp_indicators?: string[];
    contextual_factors?: string[];
  };
  recommendation?: {
    action?: string;
    details?: string;
  };
}
