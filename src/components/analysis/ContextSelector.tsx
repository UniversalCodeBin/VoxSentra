import React from 'react';
import { ContextType } from '../../types';
import { HelpCircle, AlertCircle, KeyRound, DollarSign } from 'lucide-react';

interface ContextSelectorProps {
  value: ContextType;
  onChange: (value: ContextType) => void;
  disabled?: boolean;
}

export const ContextSelector: React.FC<ContextSelectorProps> = ({
  value,
  onChange,
  disabled = false
}) => {
  const options: { id: ContextType; label: string; badge: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'unknown', label: 'Unknown', badge: 'Baseline (0)', icon: HelpCircle },
    { id: 'urgent_request', label: 'Urgent Request', badge: '+10 Risk', icon: AlertCircle },
    { id: 'sensitive_info', label: 'Sensitive Information', badge: '+14 Risk', icon: KeyRound },
    { id: 'high_value_transfer', label: 'High-Value Request', badge: '+20 Risk', icon: DollarSign }
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-[#11161D] p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
        <div>
          <span className="text-xs font-mono tracking-wider text-slate-400">CONTEXTUAL RISK</span>
          <p className="text-xs text-slate-400">
            Voice authenticity and interaction risk are evaluated separately.
          </p>
        </div>
        <span className="text-[11px] text-slate-400 italic">
          Context increases the operational risk of acting on a suspicious interaction.
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {options.map(opt => {
          const isSelected = value === opt.id;
          const Icon = opt.icon;

          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.id)}
              className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-all ${
                isSelected
                  ? 'border-cyan-500/60 bg-cyan-950/30 text-white shadow-xs'
                  : 'border-white/5 bg-[#0B0F14] text-slate-400 hover:border-white/15 hover:text-slate-200'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-98'}`}
            >
              <div className="flex w-full items-center justify-between">
                <Icon className={`h-3.5 w-3.5 ${isSelected ? 'text-cyan-400' : 'text-slate-500'}`} />
                <span className={`text-[10px] font-mono tabular-nums ${isSelected ? 'text-cyan-300 font-semibold' : 'text-slate-400'}`}>
                  {opt.badge}
                </span>
              </div>
              <span className="text-xs font-medium tracking-tight mt-0.5 truncate w-full">
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
