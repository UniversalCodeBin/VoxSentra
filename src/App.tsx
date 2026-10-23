import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { OverviewDashboard } from './components/dashboard/OverviewDashboard';
import { AnalysisWorkspace } from './components/analysis/AnalysisWorkspace';
import { LiveMonitor } from './components/live/LiveMonitor';
import { HistoryPage } from './components/history/HistoryPage';
import { ReportModal } from './components/history/ReportModal';
import { LoginPage } from './components/auth/LoginPage';
import { api, authStorage } from './services/api';
import { AnalysisRecord, AuthUser, SystemHealth } from './types';

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('overview');
  const [user, setUser] = useState<AuthUser | null>(() => authStorage.getUser() || null);
  const [token, setToken] = useState<string | null>(() => authStorage.getToken());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Application Data States
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [historyRecords, setHistoryRecords] = useState<AnalysisRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [modalRecord, setModalRecord] = useState<AnalysisRecord | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);

  // Fetch system health status
  const loadHealth = useCallback(async () => {
    try {
      const health = await api.getHealth();
      setSystemHealth(health);
    } catch (err) {
      console.warn('System health ping note:', err);
    }
  }, []);

  // Fetch real analysis history records
  const loadHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const res = await api.getHistory();
      setHistoryRecords(res.records || []);
    } catch (err) {
      console.warn('History fetch error:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    const existingToken = authStorage.getToken();
    if (!existingToken) {
      setIsAuthenticated(false);
    } else {
      api.verifySession().then(res => {
        if (res && res.valid) {
          setIsAuthenticated(true);
          setUser(res.user);
        } else {
          setIsAuthenticated(false);
        }
      }).catch(() => setIsAuthenticated(false));
    }

    loadHealth();
    loadHistory();
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, [loadHealth, loadHistory]);

  const handleLoginSuccess = (loggedInUser: AuthUser, loggedInToken: string) => {
    setUser(loggedInUser);
    setToken(loggedInToken);
    setIsAuthenticated(true);
    loadHistory();
  };

  const handleLogout = () => {
    authStorage.clear();
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
  };

  const handleAnalysisCompleted = (newRecord: AnalysisRecord) => {
    setHistoryRecords(prev => [newRecord, ...prev]);
  };

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // Titles mapping
  const getTabMeta = () => {
    switch (currentTab) {
      case 'overview':
        return {
          title: 'VOICE INTEGRITY',
          subtitle: 'Real-time protection against synthetic and replayed voice attacks.'
        };
      case 'analyze':
        return {
          title: 'ANALYZE VOICE',
          subtitle: 'Evaluate voice authenticity, acoustic signatures, and interaction risk.'
        };
      case 'live':
        return {
          title: 'LIVE VOICE INTEGRITY',
          subtitle: 'Analyze incoming microphone audio in short real-time segments.'
        };
      case 'history':
        return {
          title: 'ANALYSIS HISTORY',
          subtitle: 'Review previous voice integrity assessments and forensic audit trail.'
        };
      default:
        return { title: 'VOXSENTRA', subtitle: 'Voice Integrity Operations' };
    }
  };

  const meta = getTabMeta();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0B0F14] text-[#E6EDF3] font-sans antialiased">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        systemHealth={systemHealth}
        user={user}
        onLogout={handleLogout}
        isOpenMobile={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
      />

      {/* Main Content Viewport */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <TopBar
          title={meta.title}
          subtitle={meta.subtitle}
          systemHealth={systemHealth}
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
          onQuickAnalyze={currentTab !== 'analyze' ? () => setCurrentTab('analyze') : undefined}
        />

        {/* Page Content Viewport */}
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 max-w-7xl w-full mx-auto">
          {currentTab === 'overview' && (
            <OverviewDashboard
              historyRecords={historyRecords}
              systemHealth={systemHealth}
              onNavigateToAnalyze={() => setCurrentTab('analyze')}
              onNavigateToLive={() => setCurrentTab('live')}
              onSelectRecord={setModalRecord}
            />
          )}

          {currentTab === 'analyze' && (
            <AnalysisWorkspace
              onAnalysisComplete={handleAnalysisCompleted}
              onNavigateToLive={() => setCurrentTab('live')}
              onNavigateToHistory={() => setCurrentTab('history')}
            />
          )}

          {currentTab === 'live' && (
            <LiveMonitor />
          )}

          {currentTab === 'history' && (
            <HistoryPage
              records={historyRecords}
              onRefresh={loadHistory}
              isLoading={isLoadingHistory}
            />
          )}
        </main>
      </div>

      {/* Detail Report Modal */}
      {modalRecord && (
        <ReportModal
          record={modalRecord}
          onClose={() => setModalRecord(null)}
        />
      )}
    </div>
  );
}
