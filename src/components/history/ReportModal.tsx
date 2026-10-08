import React from 'react';
import { AnalysisRecord } from '../../types';
import { X, ShieldCheck, ShieldAlert, AlertTriangle, Download, Copy, CheckCircle, FileText, Calendar, Clock, HardDrive, Cpu, Sliders, Layers } from 'lucide-react';
import { WaveformPlayer } from '../common/WaveformPlayer';
import { MelSpectrogramView } from '../common/MelSpectrogramView';
import { RiskMeter } from '../common/RiskMeter';
import { AudioPreprocessingPipeline } from '../pipeline/AudioPreprocessingPipeline';

interface ReportModalProps {
  record: AnalysisRecord | null;
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({ record, onClose }) => {
  const [copied, setCopied] = React.useState(false);

  if (!record) return null;

  const handleCopyId = () => {
    navigator.clipboard.writeText(record.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(record, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `voxsentra-report-${record.id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const isSpoof = record.verdict === 'AI-GENERATED';
  const isSuspicious = record.verdict === 'SUSPICIOUS';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl border border-white/10 bg-[#0E131A] shadow-2xl my-8 overflow-hidden text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[#0B0F14] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-white">ANALYSIS REPORT</span>
                <span className="text-slate-600">·</span>
                <span className="font-mono text-xs text-slate-400">ID: {record.id}</span>
              </div>
              <p className="text-[11px] text-slate-400">Forensic Voice Integrity Evaluation</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyId}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white"
            >
              {copied ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied' : 'Copy ID'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="max-h-[80vh] overflow-y-auto p-6 space-y-6">
          {/* Metadata bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="rounded-lg border border-white/5 bg-[#11161D] p-3">
              <span className="text-[10px] text-slate-400">AUDIT TIMESTAMP</span>
              <div className="mt-1 text-slate-200 truncate">
                {new Date(record.timestamp).toLocaleString()}
              </div>
            </div>

            <div className="rounded-lg border border-white/5 bg-[#11161D] p-3">
              <span className="text-[10px] text-slate-400">AUDIO FILENAME</span>
              <div className="mt-1 font-semibold text-white truncate" title={record.audio_filename}>
                {record.audio_filename}
              </div>
            </div>

            <div className="rounded-lg border border-white/5 bg-[#11161D] p-3">
              <span className="text-[10px] text-slate-400">SAMPLING & LENGTH</span>
              <div className="mt-1 text-slate-200">
                16 kHz · {record.duration_seconds}s
              </div>
            </div>

            <div className="rounded-lg border border-white/5 bg-[#11161D] p-3">
              <span className="text-[10px] text-slate-400">MODEL MODE</span>
              <div className="mt-1 text-emerald-400 font-bold">
                REAL DETECTION ENGINE
              </div>
            </div>
          </div>

          {/* Verdict and Primary Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`rounded-xl border p-4 ${
              isSpoof ? 'border-red-500/30 bg-red-950/20' : isSuspicious ? 'border-amber-500/30 bg-amber-950/20' : 'border-emerald-500/30 bg-emerald-950/20'
            }`}>
              <span className="text-[10px] font-mono tracking-wider text-slate-400">VOICE VERDICT</span>
              <h3 className={`mt-1 text-2xl font-black ${
                isSpoof ? 'text-red-400' : isSuspicious ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {record.verdict}
              </h3>
              <p className="mt-1 text-xs text-slate-400">Risk rating: {record.risk_level}</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#11161D] p-4">
              <span className="text-[10px] font-mono tracking-wider text-slate-400">AI PROBABILITY</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className={`text-2xl font-mono font-bold ${record.ai_probability >= 50 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {record.ai_probability.toFixed(1)}
                </span>
                <span className="text-xs font-mono text-slate-500">%</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">Model synthetic score</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#11161D] p-4">
              <span className="text-[10px] font-mono tracking-wider text-slate-400">CONFIDENCE</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-mono font-bold text-white">
                  {record.confidence.toFixed(1)}
                </span>
                <span className="text-xs font-mono text-slate-500">%</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">Certitude threshold</p>
            </div>
          </div>

          {/* Risk Meter Component */}
          <RiskMeter
            score={record.risk_score}
            level={record.risk_level}
            contributors={record.contributors}
          />

          {/* Waveform Player */}
          <div className="rounded-xl border border-white/10 bg-[#11161D] p-4">
            <span className="text-xs font-mono tracking-wider text-slate-400 mb-2 block">WAVEFORM PROFILE</span>
            <WaveformPlayer
              peaks={record.waveform_peaks}
              duration={record.duration_seconds}
            />
          </div>

          {/* Mel Spectrogram View */}
          <AudioPreprocessingPipeline record={record} />

          <MelSpectrogramView
            data={record.mel_spectrogram}
            duration={record.duration_seconds}
            verdict={record.verdict}
          />

          {/* Why This Result (Evidence Breakdown) */}
          <div className="rounded-xl border border-white/10 bg-[#11161D] p-5 space-y-4">
            <div>
              <span className="text-xs font-mono tracking-wider text-slate-400">AUDIT EVIDENCE</span>
              <h4 className="text-sm font-bold text-white">CORROBORATING INDICATORS</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="rounded-lg border border-white/5 bg-[#0B0F14] p-3.5">
                <div className="flex items-center gap-1.5 text-cyan-400 font-semibold mb-2">
                  <Cpu className="h-3.5 w-3.5" />
                  <span>MODEL EVIDENCE</span>
                </div>
                <ul className="space-y-1.5 text-slate-300">
                  {record.evidence.model_evidence.map((ev, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="mt-1 h-1 w-1 rounded-full bg-cyan-400 shrink-0" />
                      <span>{ev}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-white/5 bg-[#0B0F14] p-3.5">
                <div className="flex items-center gap-1.5 text-amber-400 font-semibold mb-2">
                  <Sliders className="h-3.5 w-3.5" />
                  <span>DSP INDICATORS</span>
                </div>
                <ul className="space-y-1.5 text-slate-300">
                  {record.evidence.dsp_indicators.map((ev, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="mt-1 h-1 w-1 rounded-full bg-amber-400 shrink-0" />
                      <span>{ev}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-white/5 bg-[#0B0F14] p-3.5">
                <div className="flex items-center gap-1.5 text-purple-400 font-semibold mb-2">
                  <Layers className="h-3.5 w-3.5" />
                  <span>CONTEXT FACTORS</span>
                </div>
                <ul className="space-y-1.5 text-slate-300">
                  {record.evidence.contextual_factors.map((ev, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="mt-1 h-1 w-1 rounded-full bg-purple-400 shrink-0" />
                      <span>{ev}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Security Recommendation */}
          <div className="rounded-xl border border-white/10 bg-[#11161D] p-5">
            <span className="text-xs font-mono tracking-wider text-slate-400">RECOMMENDED ACTION</span>
            <h4 className="mt-1 text-sm font-bold text-white">
              {record.recommendation.action}
            </h4>
            <p className="mt-1 text-xs text-slate-400">
              {record.recommendation.details}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
