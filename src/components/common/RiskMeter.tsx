import React from 'react';
import { RiskLevel } from '../../types';
import { ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react';

interface RiskMeterProps {
  score: number; // 0 - 100
  level: RiskLevel;
  contributors?: {
    voice_authenticity?: number;
    context?: number;
    replay_indicator?: number;
  };
}

export const RiskMeter: React.FC<RiskMeterProps> = ({ score, level, contributors }) => {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));

  // Risk styling helpers
  const getRiskColor = (lvl: RiskLevel) => {
    switch (lvl) {
      case 'LOW':
        return {
          text: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/20',
          indicator: 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]'
        };
      case 'MEDIUM':
        return {
          text: 'text-amber-400',
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/20',
          indicator: 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.8)]'
        };
      case 'HIGH':
        return {
          text: 'text-orange-400',
          bg: 'bg-orange-500/10',
          border: 'border-orange-500/20',
          indicator: 'bg-orange-400 shadow-[0_0_12px_rgba(251,146,60,0.8)]'
        };
      case 'CRITICAL':
        return {
          text: 'text-red-400',
          bg: 'bg-red-500/10',
          border: 'border-red-500/20',
          indicator: 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.9)]'
        };
    }
  };

  const colors = getRiskColor(level);

  return (
    <div className="rounded-xl border border-white/10 bg-[#11161D] p-5">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-mono tracking-wider text-slate-400">RISK SCORE</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold tabular-nums text-white">
              {clampedScore}
            </span>
            <span className="font-mono text-sm text-slate-500">/ 100</span>
          </div>
        </div>

        <div className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 ${colors.bg} ${colors.border}`}>
          {level === 'LOW' ? (
            <ShieldCheck className={`h-4 w-4 ${colors.text}`} />
          ) : level === 'CRITICAL' ? (
            <ShieldAlert className={`h-4 w-4 ${colors.text}`} />
          ) : (
            <AlertTriangle className={`h-4 w-4 ${colors.text}`} />
          )}
          <span className={`text-xs font-semibold tracking-wider ${colors.text}`}>{level} RISK</span>
        </div>
      </div>

      {/* Horizontal Meter Track */}
      <div className="mt-5">
        <div className="relative h-2.5 w-full rounded-full bg-[#0B0F14] p-0.5">
          {/* Graded background track */}
          <div className="grid h-full w-full grid-cols-4 gap-1 overflow-hidden rounded-full">
            <div className="h-full bg-emerald-500/25" title="Low: 0-29" />
            <div className="h-full bg-amber-500/25" title="Medium: 30-59" />
            <div className="h-full bg-orange-500/25" title="High: 60-79" />
            <div className="h-full bg-red-500/25" title="Critical: 80-100" />
          </div>

          {/* Indicator pin */}
          <div
            style={{ left: `${clampedScore}%` }}
            className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#11161D] transition-all duration-300 ${colors.indicator}`}
          />
        </div>

        {/* Labels below meter */}
        <div className="mt-2.5 grid grid-cols-4 text-center font-mono text-[11px] text-slate-400">
          <div className="text-left text-emerald-400/80">LOW (0-29)</div>
          <div className="text-amber-400/80">MED (30-59)</div>
          <div className="text-orange-400/80">HIGH (60-79)</div>
          <div className="text-right text-red-400/80">CRIT (80-100)</div>
        </div>
      </div>

      {/* Contributors breakdown if available */}
      {contributors && (
        <div className="mt-5 border-t border-white/5 pt-4">
          <div className="text-[11px] font-mono tracking-wider text-slate-400">RISK CONTRIBUTORS</div>
          <div className="mt-2.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">Voice Authenticity</span>
              <span className="font-mono tabular-nums text-slate-400">
                {contributors.voice_authenticity !== undefined ? `+${contributors.voice_authenticity}` : 'Model-based'}
              </span>
            </div>

            {contributors.context !== undefined && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">Contextual Pressure</span>
                <span className="font-mono tabular-nums text-slate-400">
                  +{contributors.context}
                </span>
              </div>
            )}

            {contributors.replay_indicator !== undefined && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">Replay / Acoustic Indicator</span>
                <span className="font-mono tabular-nums text-slate-400">
                  +{contributors.replay_indicator}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
