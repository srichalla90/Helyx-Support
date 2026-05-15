import { useState, useEffect, useCallback } from 'react';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { loginRequest } from './authConfig';

const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true';
import Sidebar        from './components/Sidebar';
import TicketList     from './pages/TicketList';
import TicketDetail   from './pages/TicketDetail';
import GroupsPage     from './pages/GroupsPage';
import UsersPage      from './pages/UsersPage';
import CustomersPage  from './pages/CustomersPage';
import ReportsPage        from './pages/ReportsPage';
import KnowledgeBasePage  from './pages/KnowledgeBasePage';
import AnnouncementsPage     from './pages/AnnouncementsPage';
import FeatureRequestsPage  from './pages/FeatureRequestsPage';
import LoginPage      from './pages/LoginPage';
import CustomerPortal from './pages/CustomerPortal';
import { UserContext } from './context/UserContext';
import { ToastProvider } from './components/Toast';
import { api } from './api';
import './styles/index.css';

const PAGE_TITLES = {
  tickets:       'Tickets',
  open:          'Open Tickets',
  pending:       'Pending Tickets',
  resolved:      'Resolved',
  reports:       'Reports',
  knowledgebase: 'Knowledge Base',
  announcements: 'Announcements',
  features:      'Ideas Board',
  groups:        'Groups',
  users:         'Users',
  customers:     'Customers',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Safely decode a JWT payload (no signature check — that's done server-side)
function decodeTokenPayload(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch { return null; }
}

// Check if our app JWT is still valid (at least 2 minutes left)
function isAppTokenValid(token) {
  if (!token) return false;
  const payload = decodeTokenPayload(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 > Date.now() + 120_000;
}

// ── Loading screen ────────────────────────────────────────────────────────────
function LoadingScreen({ message = 'Signing you in…' }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#0F172A', gap: 20,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        border: '4px solid #334155',
        borderTop: '4px solid #3B82F6',
        animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ color: '#94A3B8', fontSize: 15, margin: 0 }}>{message}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────
export default function App() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  // Our app's user (derived from backend token exchange, cached in localStorage)
  const [user, setUser] = useState(() => {
    const token = localStorage.getItem('helyx_token');
    const userJson = localStorage.getItem('helyx_user');
    if (isAppTokenValid(token) && userJson) {
      try { return JSON.parse(userJson); } catch { /* fall through */ }
    }
    localStorage.removeItem('helyx_token');
    localStorage.removeItem('helyx_user');
    return null;
  });

  const [exchanging,  setExchanging]  = useState(false);
  const [authError,   setAuthError]   = useState('');
  const [page,        setPage]        = useState(() => sessionStorage.getItem('helyx_page') || 'tickets');
  const [ticketId,    setTicketId]    = useState(() => {
    const id = sessionStorage.getItem('helyx_ticket_id');
    return id ? Number(id) : null;
  });

  // ── Token exchange ────────────────────────────────────────────────────────
  // After Microsoft SSO succeeds (isAuthenticated = true), but before we have
  // an app token, silently acquire the ID token and exchange it with our backend.
  const doTokenExchange = useCallback(async () => {
    if (exchanging) return;
    setExchanging(true);
    setAuthError('');
    try {
      const result = await instance.acquireTokenSilent({
        ...loginRequest,
        account: accounts[0],
      });
      const { token, user: userData } = await api.azureLogin(result.idToken);
      localStorage.setItem('helyx_token', token);
      localStorage.setItem('helyx_user', JSON.stringify(userData));
      setUser(userData);
    } catch (e) {
      console.error('Token exchange failed:', e);
      setAuthError(e.message || 'Authentication failed. Please try again.');
      // Clear any stale state
      localStorage.removeItem('helyx_token');
      localStorage.removeItem('helyx_user');
    } finally {
      setExchanging(false);
    }
  }, [instance, accounts, exchanging]);

  useEffect(() => {
    // Only exchange when: MSAL is fully authenticated, no MSAL interaction in progress,
    // we have an account, and we don't already have a valid app token
    if (
      isAuthenticated &&
      inProgress === InteractionStatus.None &&
      accounts.length > 0 &&
      !user &&
      !exchanging
    ) {
      doTokenExchange();
    }
  }, [isAuthenticated, inProgress, accounts, user, exchanging]);

  // ── Dev login (bypasses MSAL) ─────────────────────────────────────────────
  function handleDevLogin(token, userData) {
    localStorage.setItem('helyx_token', token);
    localStorage.setItem('helyx_user', JSON.stringify(userData));
    setUser(userData);
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  function handleLogout() {
    localStorage.removeItem('helyx_token');
    localStorage.removeItem('helyx_user');
    sessionStorage.clear();
    setUser(null);
    if (!DEV_MODE) {
      instance.logoutRedirect({
        postLogoutRedirectUri: window.location.origin,
      }).catch(console.error);
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  function navigate(p) {
    sessionStorage.setItem('helyx_page', p);
    sessionStorage.removeItem('helyx_ticket_id');
    setPage(p);
    setTicketId(null);
  }

  function openTicket(id) {
    sessionStorage.setItem('helyx_ticket_id', String(id));
    setTicketId(id);
  }

  function backToList() {
    sessionStorage.removeItem('helyx_ticket_id');
    setTicketId(null);
  }

  // ── Render states ─────────────────────────────────────────────────────────

  if (DEV_MODE) {
    // Dev mode: skip MSAL entirely — just check for a valid app token
    if (!user) {
      return <LoginPage onDevLogin={handleDevLogin} />;
    }
  } else {
    // 1. MSAL is still processing a redirect (e.g. coming back from Microsoft login page)
    if (inProgress === InteractionStatus.HandleRedirect) {
      return <LoadingScreen message="Completing sign-in…" />;
    }

    // 2. Not signed in with Microsoft yet → show login page
    if (!isAuthenticated) {
      return <LoginPage error={authError} />;
    }

    // 3. Signed in with Microsoft but still exchanging for our app token
    if (!user || exchanging) {
      return <LoadingScreen message="Setting up your account…" />;
    }
  }

  // 4. Signed in and app token ready

  // ── Customer portal ───────────────────────────────────────────────────────
  const portalMode = new URLSearchParams(window.location.search).has('portal');
  if (user.role === 'customer' || portalMode) {
    return (
      <UserContext.Provider value={user}>
        <ToastProvider>
          <CustomerPortal onLogout={handleLogout} />
        </ToastProvider>
      </UserContext.Provider>
    );
  }

  // ── Agent / Admin view ────────────────────────────────────────────────────
  const isTicketView = ['tickets', 'open', 'pending', 'resolved'].includes(page);

  return (
    <UserContext.Provider value={user}>
      <ToastProvider>
        <div className="app">
          <Sidebar current={page} onNav={navigate} onLogout={handleLogout} />

          <div className="main">
            <header className="topbar">
              <h1>{ticketId ? `Ticket #${ticketId}` : PAGE_TITLES[page]}</h1>
            </header>

            <div className="content">
              {ticketId ? (
                <TicketDetail ticketId={ticketId} onBack={backToList} />
              ) : isTicketView ? (
                <TicketList onSelect={openTicket} filterStatus={page} />
              ) : page === 'groups' ? (
                <GroupsPage />
              ) : page === 'users' ? (
                <UsersPage />
              ) : page === 'customers' ? (
                <CustomersPage />
              ) : page === 'reports' ? (
                <ReportsPage />
              ) : page === 'knowledgebase' ? (
                <KnowledgeBasePage />
              ) : page === 'announcements' ? (
                <AnnouncementsPage />
              ) : page === 'features' ? (
                <FeatureRequestsPage />
              ) : null}
            </div>
          </div>
        </div>
      </ToastProvider>
    </UserContext.Provider>
  );
}
