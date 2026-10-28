import { useState, useEffect } from 'react';
import {
  Dashboard,
  Charter,
  Scope,
  ChangeRequestsPage,
  Schedule,
  Cost,
  Quality,
  RiskPage,
  TestCasesView,
  ExecutiveReportModal
} from './pages.jsx';
import Login from './Login.jsx';
import { api, pkr, getStoredUser, clearSession } from './api.js';

export default function App() {
  const [user, setUser] = useState(() => getStoredUser());

  const [tab, setTab] = useState('Dashboard');
  const [proj, setProj] = useState(null);
  const [evm, setEvm] = useState(null);
  const [dash, setDash] = useState(null);
  const [showReport, setShowReport] = useState(false);

  const loadMeta = () => {
    api('/dashboard').then(d => {
      setDash(d);
      if (d?.project) setProj(d.project);
      if (d?.evm) setEvm(d.evm);
    }).catch(() => {});
  };

  useEffect(() => {
    if (!user) return;
    loadMeta();
    const onRealtime = () => loadMeta();
    window.addEventListener('spm:realtime-update', onRealtime);
    return () => window.removeEventListener('spm:realtime-update', onRealtime);
  }, [user]);

  // A stored user object is only a cached view: the token is re-checked against the
  // server on load, so a revoked or expired session cannot keep the portal open.
  useEffect(() => {
    if (!user) return;
    api('/auth/me').then(r => setUser(r.user)).catch(() => { clearSession(); setUser(null); });
    const onSignedOut = () => { clearSession(); setUser(null); };
    window.addEventListener('spm:signed-out', onSignedOut);
    return () => window.removeEventListener('spm:signed-out', onSignedOut);
  }, []);

  const handleLogin = (u) => setUser(u);

  const handleLogout = () => {
    clearSession();
    setUser(null);
  };

  // If user is not authenticated, show modern Login Page
  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  const totalWeeks = proj
    ? Math.max(16, Math.ceil((new Date(proj.deadline) - new Date(proj.startDate)) / (7 * 86400000)))
    : 16;

  const weekNum = proj
    ? Math.min(totalWeeks, Math.max(1, Math.ceil((Date.now() - new Date(proj.startDate)) / (7 * 86400000))))
    : 8;

  const pendingCR = dash?.pendingChangeRequests || 0;
  const criticalDefects = dash?.criticalDefects?.length || 0;

  const NAV = [
    { key: 'Dashboard',        label: 'Executive Dashboard',   icon: '⊞' },
    { key: 'Charter',          label: 'Charter & Project Plan',icon: '📋' },
    { key: 'Scope',            label: 'Scope & WBS',           icon: '🔀' },
    { key: 'ChangeRequests',   label: 'Change Requests',       icon: '📝', badge: pendingCR },
    { key: 'Schedule',         label: 'Schedule & Gantt',      icon: '📅' },
    { key: 'Cost',             label: 'Cost & EVM Analysis',   icon: '💰' },
    { key: 'Quality',          label: 'Quality & Defects',     icon: '🛡️', badge: criticalDefects },
    { key: 'Risk',             label: 'Risk Matrix & PDPC',    icon: '⚠️' },
    { key: 'TestCases',        label: 'Test Cases & Validation', icon: '🧪' },
    { key: 'Report',           label: 'Executive Report',      icon: '📊' }
  ];

  const handleNav = (key) => {
    if (key === 'Report') {
      setShowReport(true);
    } else {
      setTab(key);
    }
    loadMeta();
  };

  const renderPage = () => {
    switch (tab) {
      case 'Dashboard':
        return <Dashboard onOpenReport={() => setShowReport(true)} weekNum={weekNum} totalWeeks={totalWeeks} initialData={dash} />;
      case 'Charter':
        return <Charter />;
      case 'Scope':
        return <Scope />;
      case 'ChangeRequests':
        return <ChangeRequestsPage />;
      case 'Schedule':
        return <Schedule />;
      case 'Cost':
        return <Cost />;
      case 'Quality':
        return <Quality />;
      case 'Risk':
        return <RiskPage />;
      case 'TestCases':
        return <TestCasesView />;
      default:
        return <Dashboard onOpenReport={() => setShowReport(true)} weekNum={weekNum} totalWeeks={totalWeeks} />;
    }
  };

  return (
    <div className="app-shell">
      {/* ── Top Header (Dark Navbar) ── */}
      <header className="top-header">
        <div className="header-left">
          <div className="logo-icon">🩺</div>
          <div>
            <div className="logo-title">
              Smart Healthcare PMS
              <span className="badge-pill">5-Hospital Network</span>
            </div>
          </div>
        </div>

        <div className="header-kpis">
          {/* User Profile Chip */}
          <div className="user-profile-badge">
            <span className="user-avatar-circle">{user.avatar || '👤'}</span>
            <span>
              <strong>{user.name}</strong>{' '}
              <span style={{ color: '#94a3b8', fontSize: 11 }}>({user.role})</span>
            </span>
          </div>

          <button className="btn-outline" onClick={loadMeta}>↻ Refresh</button>
          <button className="btn-signout" onClick={handleLogout}>🚪 Sign Out</button>
        </div>
      </header>

      <div className="body-layout">
        {/* ── Sidebar (Dark) ── */}
        <aside className="sidebar">
          <div className="sidebar-label">PROJECT MANAGEMENT MODULES</div>
          <nav>
            {NAV.map(n => (
              <button
                key={n.key}
                className={'nav-item' + (tab === n.key && n.key !== 'Report' ? ' active' : '')}
                onClick={() => handleNav(n.key)}
              >
                <span className="nav-icon">{n.icon}</span>
                <span className="nav-label">{n.label}</span>
                {n.badge > 0 && <span className="nav-badge">{n.badge}</span>}
              </button>
            ))}
          </nav>
        </aside>

        {/* ── Main Content ── */}
        <main className="main-content">
          {renderPage()}
        </main>
      </div>

      {/* ── Executive Report Modal ── */}
      {showReport && (
        <ExecutiveReportModal
          dash={dash}
          proj={proj}
          evm={evm}
          weekNum={weekNum}
          totalWeeks={totalWeeks}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
