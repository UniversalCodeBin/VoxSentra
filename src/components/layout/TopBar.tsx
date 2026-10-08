import React from 'react';
import { Menu, Mic, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { SystemHealth } from '../../types';

interface TopBarProps {
  title: string;
  subtitle?: string;
  systemHealth: SystemHealth | null;
  onOpenMobileNav: () => void;
  onQuickAnalyze?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  title,
  subtitle,
  systemHealth,
  onOpenMobileNav,
  onQuickAnalyze
}) => {
  const isRealModel = systemHealth?.model_mode === 'real';

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-[#0B0F14]/90 px-6 backdrop-blur-xs">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:text-white md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div>
          <h1 className="text-base font-bold tracking-tight text-white sm:text-lg">
            {title}
          </h1>
          {subtitle && (
            <p className="hidden text-xs text-slate-400 sm:block">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        {/* Status Indicators */}
        <div className="hidden lg:flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{isRealModel ? 'REAL DETECTION ENGINE' : 'DETECTION ENGINE ONLINE'}</span>
          </div>

          <span className="text-white/10">|</span>

          <div className="flex items-center gap-1.5 text-slate-400">
            <span className="h-2 w-2 rounded-full bg-cyan-400" />
            <span>API CONNECTED</span>
          </div>
        </div>

        {onQuickAnalyze && (
          <button
            type="button"
            onClick={onQuickAnalyze}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-medium text-slate-950 transition-colors hover:bg-cyan-400 active:scale-95"
          >
            <Mic className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Analyze Voice</span>
            <span className="sm:hidden">Analyze</span>
          </button>
        )}
      </div>
    </header>
  );
};
