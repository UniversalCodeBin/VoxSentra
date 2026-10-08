import React from 'react';
import { AnalysisRecord, SystemHealth } from '../../types';
import { Mic, ShieldAlert, Activity, Cpu, ArrowUpRight, CheckCircle2, ChevronRight, Layers, Radio } from 'lucide-react';

interface OverviewDashboardProps {
  historyRecords: AnalysisRecord[];
  systemHealth: SystemHealth | null;
  onNavigateToAnalyze: () => void;
  onNavigateToLive: () => void;
  onSelectRecord: (record: AnalysisRecord) => void;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  historyRecords,
  systemHealth,
  onNavigateToAnalyze,
  onNavigateToLive,
  onSelectRecord
}) => {
  const totalAnalyses = historyRecords.length;
  const highRiskEvents = historyRecords.filter(r => r.risk_level === 'HIGH' || r.risk_level === 'CRITICAL').length;
  const threatRate = totalAnalyses > 0 ? ((highRiskEvents / totalAnalyses) * 100).toFixed(1) : '—';
  const engineStatus = systemHealth?.detection_engine || 'ONLINE';

  return (
    <div className="space-y-6">
      {/* Hero Security Overview Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#11161D] p-6">
        <div>
          <span className="text-xs font-mono tracking-widest text-slate-400">OPERATIONAL SECURITY DASHBOARD</span>
          <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            VOICE INTEGRITY
          </h2>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-400 max-w-2xl">
            Detect synthetic voices, neural clones, and acoustic replay attacks before they compromise organizational credentials.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onNavigateToAnalyze}
            className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition-colors active:scale-95 shadow-sm"
          >
            <Mic className="h-4 w-4" />
            <span>Analyze Voice</span>
          </button>

          <button
            type="button"
            onClick={onNavigateToLive}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Radio className="h-4 w-4" />
            <span>Live Stream</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid (Strictly Grounded in Real Backend Data) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Analyses */}
        <div className="rounded-xl border border-white/10 bg-[#11161D] p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono tracking-wider text-slate-400">TOTAL ANALYSES</span>
            <Activity className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold tabular-nums text-white">
              {totalAnalyses > 0 ? totalAnalyses : '0'}
            </span>
            <span className="text-xs text-slate-400">audits</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Recorded forensic evaluations
          </p>
        </div>

        {/* Card 2: High-Risk Events */}
        <div className="rounded-xl border border-white/10 bg-[#11161D] p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono tracking-wider text-slate-400">HIGH-RISK EVENTS</span>
            <ShieldAlert className="h-4 w-4 text-red-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold tabular-nums text-red-400">
              {highRiskEvents}
            </span>
            <span className="text-xs text-slate-400">critical / high</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Spoof & impersonation alerts
          </p>
        </div>

        {/* Card 3: Threat Rate */}
        <div className="rounded-xl border border-white/10 bg-[#11161D] p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono tracking-wider text-slate-400">THREAT RATE</span>
            <span className="h-2 w-2 rounded-full bg-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="font-mono text-3xl font-bold tabular-nums text-white">
              {threatRate}
            </span>
            {threatRate !== '—' && <span className="text-xs font-mono text-slate-400">%</span>}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            {totalAnalyses > 0 ? 'Ratio of suspicious interactions' : 'Awaiting analyses'}
          </p>
        </div>

        {/* Card 4: Detection Engine */}
        <div className="rounded-xl border border-white/10 bg-[#11161D] p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono tracking-wider text-slate-400">DETECTION ENGINE</span>
            <Cpu className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-xl font-bold tracking-tight text-emerald-400">
              {engineStatus}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-400 font-mono">
            CNN Mel-spectrogram · 16 kHz
          </p>
        </div>
      </div>

      {/* Core Detection Architecture Pipeline Visual */}
      <div className="rounded-xl border border-white/10 bg-[#11161D] p-5">
        <div className="mb-4">
          <span className="text-xs font-mono tracking-wider text-slate-400">SYSTEM ARCHITECTURE</span>
          <h3 className="text-sm font-bold text-white">FORENSIC ACOUSTIC PIPELINE</h3>
          <p className="text-xs text-slate-400">
            How VoxSentra inspects speech integrity from waveform to recommendation:
          </p>
        </div>

        {/* Pipeline Sequence Nodes */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {[
            { step: '01', title: 'Raw Audio', desc: 'Direct mic or upload' },
            { step: '02', title: '16 kHz Mono', desc: 'Downsampling & norm' },
            { step: '03', title: 'Mel Spectrogram', desc: '32-bin STFT matrix' },
            { step: '04', title: 'CNN Classifier', desc: 'Deepfake pattern match' },
            { step: '05', title: 'DSP Heuristics', desc: 'Jitter, Nyquist & PAPR' },
            { step: '06', title: 'Context Engine', desc: 'Transaction pressure' },
            { step: '07', title: 'Security Verdict', desc: 'Action recommendation' }
          ].map((item, idx) => (
            <div
              key={item.step}
              className="relative flex flex-col justify-between rounded-lg border border-white/5 bg-[#0B0F14] p-3 text-left"
            >
              <div>
                <span className="font-mono text-[10px] text-cyan-400">{item.step}</span>
                <div className="mt-1 text-xs font-semibold text-slate-200">{item.title}</div>
              </div>
              <p className="mt-2 text-[10px] text-slate-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="rounded-xl border border-white/10 bg-[#11161D] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xs font-mono tracking-wider text-slate-400">RECENT DETECTIONS</span>
            <h3 className="text-sm font-bold text-white">LATEST VOICE AUDITS</h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {historyRecords.length} records in audit trail
          </span>
        </div>

        {historyRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 py-10 text-center">
            <Activity className="h-8 w-8 text-slate-600 mb-2" />
            <span className="text-xs font-medium text-slate-300">No voice assessments recorded yet.</span>
            <p className="text-[11px] text-slate-400 mt-0.5">Upload a sample to initiate the first integrity evaluation.</p>
            <button
              type="button"
              onClick={onNavigateToAnalyze}
              className="mt-3 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-400"
            >
              Analyze Voice
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 font-mono text-[11px] text-slate-400">
                  <th className="pb-2.5 font-normal">TIME</th>
                  <th className="pb-2.5 font-normal">AUDIO FILE</th>
                  <th className="pb-2.5 font-normal">VERDICT</th>
                  <th className="pb-2.5 font-normal">AI PROBABILITY</th>
                  <th className="pb-2.5 font-normal">RISK SCORE</th>
                  <th className="pb-2.5 font-normal text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {historyRecords.slice(0, 5).map(record => {
                  const isSpoof = record.verdict === 'AI-GENERATED';
                  const isSuspicious = record.verdict === 'SUSPICIOUS';
                  return (
                    <tr
                      key={record.id}
                      onClick={() => onSelectRecord(record)}
                      className="group cursor-pointer hover:bg-white/5 transition-colors"
                    >
                      <td className="py-3 font-mono text-slate-400">
                        {new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="py-3 font-medium text-white max-w-[200px] truncate">
                        {record.audio_filename}
                      </td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1 font-mono font-semibold ${
                          isSpoof ? 'text-red-400' : isSuspicious ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            isSpoof ? 'bg-red-400' : isSuspicious ? 'bg-amber-400' : 'bg-emerald-400'
                          }`} />
                          {record.verdict}
                        </span>
                      </td>
                      <td className="py-3 font-mono tabular-nums text-slate-300">
                        {record.ai_probability.toFixed(1)}%
                      </td>
                      <td className="py-3">
                        <span className={`font-mono tabular-nums font-semibold ${
                          record.risk_score >= 60 ? 'text-red-400' : record.risk_score >= 30 ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          {record.risk_score} / 100 ({record.risk_level})
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <span className="inline-flex items-center gap-1 text-slate-400 group-hover:text-cyan-400 font-medium">
                          <span>Report</span>
                          <ChevronRight className="h-3 w-3" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
