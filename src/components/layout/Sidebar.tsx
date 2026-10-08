import React from 'react';
import { LayoutDashboard, Mic, Radio, History, Shield, LogOut, Cpu, RadioTower, CheckCircle2 } from 'lucide-react';
import { AuthUser, SystemHealth } from '../../types';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  systemHealth: SystemHealth | null;
  user: AuthUser | null;
  onLogout: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  systemHealth,
  user,
  onLogout,
  isOpenMobile = false,
  onCloseMobile
}) => {
  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'analyze', label: 'Analyze Voice', icon: Mic },
    { id: 'live', label: 'Live Monitor', icon: Radio },
    { id: 'history', label: 'History', icon: History }
  ];

  const content = (
    <div className="flex h-full w-64 flex-col border-r border-white/10 bg-[#0B0F14] text-slate-200">
      {/* Brand Header */}
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-sm">
          <Shield className="h-4 w-4" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-sans text-sm font-bold tracking-wider text-white">VOXSENTRA</span>
          </div>
          <span className="text-[10px] font-mono tracking-widest text-slate-400">VOICE INTEGRITY</span>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-3 py-4">
        <div className="mb-2 px-3 text-[10px] font-mono tracking-wider text-slate-400">OPERATIONS</div>
        <nav className="space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onTabChange(item.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-white/10 text-white font-semibold shadow-xs'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <div className={`relative flex items-center justify-center ${isActive ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'}`}>
                  <Icon className="h-4 w-4" />
                  {isActive && (
                    <span className="absolute -left-3 h-4 w-1 rounded-r-full bg-cyan-400" />
                  )}
                </div>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* System Status Indicators */}
      <div className="border-t border-white/10 bg-[#0E131A] px-4 py-3.5">
        <div className="mb-2 text-[10px] font-mono tracking-wider text-slate-400">SYSTEM STATUS</div>
        <div className="space-y-2 text-[11px] font-mono">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Cpu className="h-3.5 w-3.5 text-slate-500" />
              <span>Detection Engine</span>
            </div>
            <div className="flex items-center gap-1 text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>ONLINE</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-400">
              <RadioTower className="h-3.5 w-3.5 text-slate-500" />
              <span>API Gateway</span>
            </div>
            <div className="flex items-center gap-1 text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>CONNECTED</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-slate-400">
            <span>Audio Sampling</span>
            <span>16 kHz Mono</span>
          </div>
        </div>
      </div>

      {/* User Profile & Logout */}
      <div className="border-t border-white/10 px-4 py-3 bg-[#0B0F14]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 truncate">
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/10 bg-slate-800">
              <img
                src="/src/assets/images/avatar_security_analyst_1791480838815.jpg"
                alt="Analyst"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div className="truncate">
              <div className="truncate text-xs font-medium text-slate-200">
                {user?.name || 'Security Analyst'}
              </div>
              <div className="truncate text-[10px] font-mono text-slate-400">
                SOC Level 3
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-white/10 hover:text-slate-200"
            title="Sign Out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex shrink-0">
        {content}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 flex">
            {content}
          </div>
        </div>
      )}
    </>
  );
};
