import React, { useState, useMemo } from 'react';
import { AnalysisRecord, VerdictType, RiskLevel } from '../../types';
import { Search, Filter, ArrowUpDown, ChevronRight, FileAudio, ShieldAlert, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';
import { ReportModal } from './ReportModal';

interface HistoryPageProps {
  records: AnalysisRecord[];
  onRefresh: () => void;
  isLoading?: boolean;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  records,
  onRefresh,
  isLoading = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [verdictFilter, setVerdictFilter] = useState<string>('ALL');
  const [riskFilter, setRiskFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'risk_desc'>('newest');
  const [selectedRecord, setSelectedRecord] = useState<AnalysisRecord | null>(null);

  // Client-side filtering & sorting of real backend records
  const filteredRecords = useMemo(() => {
    let result = [...records];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(r => 
        r.audio_filename.toLowerCase().includes(q) || 
        r.id.toLowerCase().includes(q)
      );
    }

    if (verdictFilter !== 'ALL') {
      result = result.filter(r => r.verdict === verdictFilter);
    }

    if (riskFilter !== 'ALL') {
      result = result.filter(r => r.risk_level === riskFilter);
    }

    if (sortBy === 'oldest') {
      result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } else if (sortBy === 'risk_desc') {
      result.sort((a, b) => b.risk_score - a.risk_score);
    } else {
      // Newest
      result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    return result;
  }, [records, searchTerm, verdictFilter, riskFilter, sortBy]);

  const getVerdictBadge = (verdict: VerdictType) => {
    switch (verdict) {
      case 'GENUINE':
        return { text: 'text-emerald-400', dot: 'bg-emerald-400' };
      case 'SUSPICIOUS':
        return { text: 'text-amber-400', dot: 'bg-amber-400' };
      case 'AI-GENERATED':
        return { text: 'text-red-400', dot: 'bg-red-400' };
    }
  };

  const formatContext = (ctx: string) => {
    switch (ctx) {
      case 'urgent_request':
        return 'Urgent Request';
      case 'sensitive_info':
        return 'Sensitive Info';
      case 'high_value_transfer':
        return 'High-Value Transfer';
      default:
        return 'Baseline';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs font-mono tracking-widest text-slate-400">AUDIT ARCHIVE</span>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            ANALYSIS HISTORY
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Review previous voice integrity assessments, forensic logs, and risk calculations.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center gap-1.5 self-start rounded-lg border border-white/10 bg-[#11161D] px-3 py-2 text-xs font-medium text-slate-300 hover:text-white transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Records</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#11161D] p-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search by audio filename or record ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-[#0B0F14] py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-hidden"
          />
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Verdict Filter */}
          <select
            value={verdictFilter}
            onChange={(e) => setVerdictFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#0B0F14] px-2.5 py-2 text-xs font-mono text-slate-300 focus:outline-hidden"
          >
            <option value="ALL">All Verdicts</option>
            <option value="GENUINE">Genuine</option>
            <option value="SUSPICIOUS">Suspicious</option>
            <option value="AI-GENERATED">AI-Generated</option>
          </select>

          {/* Risk Filter */}
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#0B0F14] px-2.5 py-2 text-xs font-mono text-slate-300 focus:outline-hidden"
          >
            <option value="ALL">All Risk Levels</option>
            <option value="LOW">Low Risk</option>
            <option value="MEDIUM">Medium Risk</option>
            <option value="HIGH">High Risk</option>
            <option value="CRITICAL">Critical Risk</option>
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e: any) => setSortBy(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#0B0F14] px-2.5 py-2 text-xs font-mono text-slate-300 focus:outline-hidden"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="risk_desc">Highest Risk</option>
          </select>
        </div>
      </div>

      {/* History Table */}
      <div className="rounded-xl border border-white/10 bg-[#11161D] overflow-hidden">
        {filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileAudio className="h-10 w-10 text-slate-600 mb-2" />
            <h4 className="text-sm font-semibold text-slate-300">NO ANALYSES MATCHED</h4>
            <p className="mt-1 text-xs text-slate-500 max-w-sm">
              No previous recordings match your filter or search criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-[#0E131A] font-mono text-[11px] text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-normal">TIME</th>
                  <th className="py-3 px-4 font-normal">AUDIO FILE</th>
                  <th className="py-3 px-4 font-normal">VERDICT</th>
                  <th className="py-3 px-4 font-normal">AI PROBABILITY</th>
                  <th className="py-3 px-4 font-normal">RISK</th>
                  <th className="py-3 px-4 font-normal">CONTEXT</th>
                  <th className="py-3 px-4 font-normal text-right">AUDIT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredRecords.map((record) => {
                  const vStyle = getVerdictBadge(record.verdict);
                  return (
                    <tr
                      key={record.id}
                      onClick={() => setSelectedRecord(record)}
                      className="group cursor-pointer hover:bg-white/5 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                        {new Date(record.timestamp).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white truncate max-w-[180px] sm:max-w-xs">
                            {record.audio_filename}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">
                            ({record.duration_seconds}s)
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 font-mono font-bold ${vStyle.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${vStyle.dot}`} />
                          {record.verdict}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {record.ai_probability.toFixed(1)}%
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`font-mono tabular-nums font-semibold ${
                          record.risk_score >= 80 ? 'text-red-400' :
                          record.risk_score >= 60 ? 'text-orange-400' :
                          record.risk_score >= 30 ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          {record.risk_score} / 100 ({record.risk_level})
                        </span>
                      </td>

                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                        {formatContext(record.context)}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-slate-500 group-hover:text-cyan-400 transition-colors">
                          <span className="font-mono text-[11px]">View</span>
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

      {/* Detailed Analysis Modal */}
      {selectedRecord && (
        <ReportModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </div>
  );
};
