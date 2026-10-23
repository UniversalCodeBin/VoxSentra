import React, { useState } from 'react';
import { Shield, Lock, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../../services/api';
import { AuthUser } from '../../types';

interface LoginPageProps {
  onLoginSuccess: (user: AuthUser, token: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const resp = await api.login(identifier, password);
      onLoginSuccess(resp.user, resp.token);
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#0B0F14] p-4 text-slate-200">
      <div className="flex w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-[#11161D] shadow-2xl">
        {/* Left Side: Brand & Mission */}
        <div className="hidden md:flex w-1/2 flex-col justify-between border-r border-white/10 bg-[#0E131A] p-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <span className="font-sans text-base font-bold tracking-wider text-white">VOXSENTRA</span>
                <div className="text-[10px] font-mono tracking-widest text-slate-400">VOICE INTEGRITY</div>
              </div>
            </div>

            <div className="mt-12">
              <h2 className="text-2xl font-extrabold tracking-tight text-white leading-tight">
                Detect synthetic voices before they become security threats.
              </h2>
              <p className="mt-4 text-xs text-slate-400 leading-relaxed">
                Real-time acoustic inference, 16 kHz Mel-spectrogram deep learning, and contextual risk scoring designed for enterprise security operations.
              </p>
            </div>
          </div>

          <div className="space-y-2 border-t border-white/10 pt-6 text-[11px] font-mono text-slate-400">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>Real Acoustic CNN Classifier</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>Context-Aware Transaction Scoring</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>Cryptographically Signed JWT Audit</span>
            </div>
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="w-full md:w-1/2 p-8 sm:p-10 flex flex-col justify-between">
          <div>
            <div className="md:hidden flex items-center gap-2.5 mb-6">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                <Shield className="h-4 w-4" />
              </div>
              <span className="font-bold text-white text-sm">VOXSENTRA</span>
            </div>

            <span className="text-xs font-mono tracking-wider text-slate-400">OPERATIONS ACCESS</span>
            <h3 className="mt-1 text-xl font-bold text-white">SIGN IN</h3>
            <p className="mt-1 text-xs text-slate-400">
              Enter your authorized SOC analyst credentials to proceed.
            </p>

            {errorMsg && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300">Email or Username</label>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2.5 text-xs text-white focus:border-cyan-500 focus:outline-hidden"
                  placeholder="Email or Username"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2.5 text-xs text-white focus:border-cyan-500 focus:outline-hidden"
                  placeholder="••••••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 active:scale-98 transition-all shadow-sm cursor-pointer"
              >
                <span>{isLoading ? 'Verifying Session...' : 'Sign In'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </form>
    <div class='mt-4 text-center text-sm text-cyan-400'><button onClick={() => window.location.href='#/register'} className='underline hover:text-white'>Don't have an account? Create account</button></div>
          </div>

          <div className="mt-8 border-t border-white/5 pt-4 text-center">
            <div className="flex items-center justify-center gap-2 text-[11px] font-mono text-slate-400">
              <Lock className="h-3 w-3 text-slate-400" />
              <span>Secure authentication · JWT protected</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
