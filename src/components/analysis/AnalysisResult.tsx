import React, { useState } from 'react';
import { AnalysisRecord, VerdictType } from '../../types';
import { WaveformPlayer } from '../common/WaveformPlayer';
import { MelSpectrogramView } from '../common/MelSpectrogramView';
import { RiskMeter } from '../common/RiskMeter';
import { AudioPreprocessingPipeline } from './AudioPreprocessingPipeline';
import { 
  ShieldCheck, 
  AlertTriangle, 
  ShieldAlert, 
  Cpu, 
  Sliders, 
  Layers, 
  RotateCcw, 
  FileText, 
  Download, 
  CheckCircle,
  Copy,
  ExternalLink
} from 'lucide-react';

interface AnalysisResultProps {
  record: AnalysisRecord;
  audioBlob?: Blob | null;
  onReset: () => void;
  onViewHistory?: () => void;
}

export const AnalysisResult: React.FC<AnalysisResultProps> = ({
  record,
  audioBlob,
  onReset,
  onViewHistory
}) => {
  const [copied, setCopied] = useState(false);
  const [acousticLayout, setAcousticLayout] = useState<'stacked' | 'split'>('stacked');

  const getVerdictStyles = (verdict: VerdictType) => {
    switch (verdict) {
      case 'GENUINE':
        return {
          text: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          badge: 'bg-emerald-500/20 text-emerald-300',
          icon: ShieldCheck,
          label: 'GENUINE VOICE'
        };
      case 'SUSPICIOUS':
        return {
          text: 'text-amber-400',
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          badge: 'bg-amber-500/20 text-amber-300',
          icon: AlertTriangle,
          label: 'SUSPICIOUS VOICE'
        };
      case 'AI-GENERATED':
        return {
          text: 'text-red-400',
          bg: 'bg-red-500/10',
          border: 'border-red-500/30',
          badge: 'bg-red-500/20 text-red-300',
          icon: ShieldAlert,
          label: 'AI-GENERATED / SPOOF'
        };
    }
  };

  const style = getVerdictStyles(record.verdict);
  const VerdictIcon = style.icon;

  const handleCopyId = () => {
    navigator.clipboard.writeText(record.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(record, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `voxsentra-audit-${record.id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Verdict Card */}
      <div className={`rounded-xl border ${style.border} ${style.bg} p-6 transition-all`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border ${style.border} bg-[#0B0F14]`}>
              <VerdictIcon className={`h-8 w-8 ${style.text}`} />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono tracking-widest text-slate-400">VOICE VERDICT</span>
                <span className="text-slate-600">·</span>
                <span className="text-xs font-mono text-slate-400">REAL MODEL EVALUATION</span>
              </div>
              <h2 className={`mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight ${style.text}`}>
                {record.verdict}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-300">
                <span>File: <strong className="font-mono text-white">{record.audio_filename}</strong></span>
                <span className="text-slate-600">·</span>
                <span>Duration: <strong className="font-mono text-white">{record.duration_seconds}s</strong></span>
                <span className="text-slate-600">·</span>
                <span className="font-mono text-slate-400">ID: {record.id}</span>
              </div>
            </div>
          </div>

          {/* Core Numerical Metrics Grid */}
          <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4 md:border-t-0 md:border-l md:pl-6 md:pt-0">
            <div className="rounded-lg border border-white/10 bg-[#0B0F14]/70 p-3.5">
              <span className="text-[11px] font-mono tracking-wider text-slate-400">CONFIDENCE</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="font-mono text-2xl font-bold tabular-nums text-white">
                  {record.confidence.toFixed(1)}
                </span>
                <span className="text-xs font-mono text-slate-500">%</span>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">Statistical model certitude</p>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#0B0F14]/70 p-3.5">
              <span className="text-[11px] font-mono tracking-wider text-slate-400">AI PROBABILITY</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className={`font-mono text-2xl font-bold tabular-nums ${record.ai_probability >= 50 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {record.ai_probability.toFixed(1)}
                </span>
                <span className="text-xs font-mono text-slate-500">%</span>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">Synthetic spoof likelihood</p>
            </div>
          </div>
        </div>
      </div>

      {/* View Layout Selector Bar */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2 text-xs">
        <span className="font-mono text-slate-400 text-[11px] tracking-wider">
          ACOUSTIC SIGNAL ANALYSIS
        </span>
        <div className="flex items-center rounded-lg border border-white/10 bg-[#11161D] p-0.5 font-mono text-[11px]">
          <button
            type="button"
            onClick={() => setAcousticLayout('stacked')}
            className={`rounded px-2.5 py-1 transition-colors ${acousticLayout === 'stacked' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'}`}
          >
            Stacked View
          </button>
          <button
            type="button"
            onClick={() => setAcousticLayout('split')}
            className={`rounded px-2.5 py-1 transition-colors ${acousticLayout === 'split' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'}`}
          >
            Side-by-Side (Split)
          </button>
        </div>
      </div>

      {acousticLayout === 'stacked' ? (
        <>
          {/* Middle Section: Risk Score & Waveform */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Risk Meter Component */}
            <RiskMeter
              score={record.risk_score}
              level={record.risk_level}
              contributors={record.contributors}
            />

            {/* Audio Waveform Player */}
            <div className="rounded-xl border border-white/10 bg-[#11161D] p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-xs font-mono tracking-wider text-slate-400">AUDIO WAVEFORM</span>
                    <p className="text-xs text-slate-400">Analyzed signal profile normalized to 16 kHz mono</p>
                  </div>
                  <span className="text-xs font-mono text-cyan-400">PCM Peaks</span>
                </div>
                
                <WaveformPlayer
                  peaks={record.waveform_peaks}
                  audioBlob={audioBlob}
                  duration={record.duration_seconds}
                />
              </div>

              <div className="mt-4 border-t border-white/5 pt-3 flex items-center justify-between text-xs text-slate-400">
                <span>Encoding: <strong className="text-slate-300 font-mono">PCM 16-bit</strong></span>
                <span>Sampling: <strong className="text-slate-300 font-mono">16,000 Hz</strong></span>
                <span>Channel: <strong className="text-slate-300 font-mono">1 (Mono)</strong></span>
              </div>
            </div>
          </div>

          {/* Interactive 10-Stage Audio Preprocessing Pipeline */}
          <AudioPreprocessingPipeline record={record} />

          {/* Mel Spectrogram View */}
          <MelSpectrogramView
            data={record.mel_spectrogram}
            audioBlob={audioBlob}
            duration={record.duration_seconds}
            verdict={record.verdict}
          />
        </>
      ) : (
        <>
          {/* Risk Meter full width */}
          <RiskMeter
            score={record.risk_score}
            level={record.risk_level}
            contributors={record.contributors}
          />

          {/* Side by Side: Waveform and Mel Spectrogram */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-[#11161D] p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono tracking-wider text-slate-400">WAVEFORM TIME DOMAIN</span>
                  <span className="text-xs font-mono text-cyan-400">16 kHz PCM</span>
                </div>
                <WaveformPlayer
                  peaks={record.waveform_peaks}
                  audioBlob={audioBlob}
                  duration={record.duration_seconds}
                />
              </div>
            </div>

            <div>
              <MelSpectrogramView
                data={record.mel_spectrogram}
                audioBlob={audioBlob}
                duration={record.duration_seconds}
                verdict={record.verdict}
              />
            </div>
          </div>

          {/* Preprocessing pipeline */}
          <AudioPreprocessingPipeline record={record} />
        </>
      )}

      {/* WHY THIS RESULT? Explainability Triad */}
      <div className="rounded-xl border border-white/10 bg-[#11161D] p-5">
        <div className="mb-4">
          <span className="text-xs font-mono tracking-wider text-slate-400">EXPLAINABILITY AUDIT</span>
          <h3 className="text-base font-bold text-white">WHY THIS RESULT?</h3>
          <p className="text-xs text-slate-400">
            Acoustic model evidence is strictly isolated from DSP heuristics and context weights.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Model Evidence */}
          <div className="rounded-lg border border-white/5 bg-[#0B0F14] p-4">
            <div className="flex items-center gap-2 mb-2 text-cyan-400 text-xs font-semibold">
              <Cpu className="h-4 w-4" />
              <span>MODEL EVIDENCE</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">Learned acoustic neural patterns</p>
            <ul className="space-y-2 text-xs text-slate-300">
              {record.evidence.model_evidence.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 2. DSP / Signal Indicators */}
          <div className="rounded-lg border border-white/5 bg-[#0B0F14] p-4">
            <div className="flex items-center gap-2 mb-2 text-amber-400 text-xs font-semibold">
              <Sliders className="h-4 w-4" />
              <span>DSP / SIGNAL INDICATORS</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">Deterministic signal heuristics</p>
            <ul className="space-y-2 text-xs text-slate-300">
              {record.evidence.dsp_indicators.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 3. Contextual Factors */}
          <div className="rounded-lg border border-white/5 bg-[#0B0F14] p-4">
            <div className="flex items-center gap-2 mb-2 text-purple-400 text-xs font-semibold">
              <Layers className="h-4 w-4" />
              <span>CONTEXTUAL FACTORS</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">Transaction & scenario modifiers</p>
            <ul className="space-y-2 text-xs text-slate-300">
              {record.evidence.contextual_factors.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-purple-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* RECOMMENDED ACTION Section */}
      <div className="rounded-xl border border-white/10 bg-[#11161D] p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-slate-200">
            <FileText className="h-5 w-5" />
          </div>

          <div className="flex-1">
            <span className="text-xs font-mono tracking-wider text-slate-400">SECURITY RECOMMENDATION</span>
            <h4 className="mt-0.5 text-base font-bold text-white">
              {record.recommendation.action}
            </h4>
            <p className="mt-1 text-xs text-slate-300">
              {record.recommendation.details}
            </p>

            <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-200/90">
              <strong>SOC Standard Operating Protocol:</strong> Autonomous execution or financial approval/rejection must never be triggered solely from ML classification. Always follow verified verification escalation procedures.
            </div>
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-cyan-400 transition-colors active:scale-95"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Analyze Another Voice</span>
          </button>

          {onViewHistory && (
            <button
              type="button"
              onClick={onViewHistory}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <span>View in History</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyId}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-xs font-mono text-slate-300 hover:text-white transition-colors"
          >
            {copied ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied ID' : 'Copy ID'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export JSON Audit</span>
          </button>
        </div>
      </div>
    </div>
  );
};
