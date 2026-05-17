import { useEffect, useState } from 'react';
import { api } from '../api';
import { useUser } from '../context/UserContext';

const NAV = [
  { id: 'tickets',   icon: '🎫', label: 'All Tickets' },
  { id: 'open',      icon: '📬', label: 'Open' },
  { id: 'pending',   icon: '⏳', label: 'Pending' },
  { id: 'resolved',  icon: '✅', label: 'Resolved' },
];

const HOME_NAV = [
  { id: 'home', icon: '🏠', label: 'Operations Center' },
];

const ANALYTICS = [
  { id: 'reports',       icon: '📊', label: 'Reports' },
  { id: 'knowledgebase', icon: '📚', label: 'Knowledge Base' },
  { id: 'announcements', icon: '📣', label: 'Announcements' },
  { id: 'features',      icon: '💡', label: 'Ideas Board' },
];

const SETTINGS = [
  { id: 'contacts',    icon: '📇', label: 'Contacts' },
  { id: 'groups',      icon: '👥', label: 'Groups' },
  { id: 'users',       icon: '🧑', label: 'Users' },
  { id: 'customers',   icon: '🏢', label: 'Customers' },
  { id: 'products',    icon: '📦', label: 'Products' },
  { id: 'deployments', icon: '🚀', label: 'Deployments' },
  { id: 'settings',    icon: '⚙️', label: 'Settings', adminOnly: true },
];

export default function Sidebar({ current, onNav, onLogout }) {
  const user = useUser();
  const [stats,    setStats]    = useState(null);
  const [settings, setSettings] = useState({ company_name: 'Helyx', support_email: '' });

  useEffect(() => {
    api.getStats().then(setStats).catch(() => {});
    const timer = setInterval(() => api.getStats().then(setStats).catch(() => {}), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    api.getSettings().then((s) => setSettings((prev) => ({ ...prev, ...s }))).catch(() => {});
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 12px' }}>
        <img
          src="/Helyx Logo.png"
          alt="Helyx"
          style={{ height: 36, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      </div>

      {/* Home / Ops Center */}
      <div style={{ padding: '8px 0 4px' }}>
        {HOME_NAV.map((item) => (
          <button
            key={item.id}
            className={`sidebar-item ${current === item.id ? 'active' : ''}`}
            onClick={() => onNav(item.id)}
            style={{
              fontWeight: 600,
              color: current === item.id ? '#FFFFFF' : '#E2E8F0',
              letterSpacing: '0.1px',
            }}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <div style={{ margin: '4px 12px', borderTop: '1px solid #334155' }} />

      <div className="sidebar-section">
        <div className="sidebar-section-label">Tickets</div>
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`sidebar-item ${current === item.id ? 'active' : ''}`}
            onClick={() => onNav(item.id)}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
            {stats && item.id === 'open'    && stats.open     > 0 && <span className="badge">{stats.open}</span>}
            {stats && item.id === 'pending' && stats.pending  > 0 && <span className="badge">{stats.pending}</span>}
            {stats && item.id === 'tickets' && stats.total    > 0 && <span className="badge">{stats.total}</span>}
          </button>
        ))}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Analytics</div>
        {ANALYTICS.map((item) => (
          <button
            key={item.id}
            className={`sidebar-item ${current === item.id ? 'active' : ''}`}
            onClick={() => onNav(item.id)}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Settings</div>
        {SETTINGS.map((item) => (
          <button
            key={item.id}
            className={`sidebar-item ${current === item.id ? 'active' : ''}`}
            onClick={() => onNav(item.id)}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
            {/* Lock icon for pages with restricted edit access */}
            {user?.role === 'agent' && (item.id === 'users' || item.adminOnly) && (
              <span title="View only" style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.5 }}>🔒</span>
            )}
          </button>
        ))}
      </div>

      {/* Customer portal quick-launch */}
      <div style={{ padding: '10px 12px' }}>
        <button
          onClick={() => window.open(window.location.origin + window.location.pathname + '?portal=1', '_blank')}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
            background: '#0F3460', border: '1px solid #1E4D8C',
            color: '#93C5FD', fontSize: 13, fontWeight: 600,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#1E4D8C'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#0F3460'}
        >
          <span style={{ fontSize: 15 }}>🌐</span>
          <span style={{ flex: 1, textAlign: 'left' }}>Customer Portal</span>
          <span style={{ fontSize: 11, opacity: 0.6 }}>↗</span>
        </button>
      </div>

      <div style={{ padding: '12px 16px', borderTop: '1px solid #334155' }}>
        <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>Signed in as</div>
        <div style={{ fontSize: 13, color: '#FFFFFF', fontWeight: 600, marginBottom: 2 }}>{user?.name}</div>
        <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 8 }}>{user?.email}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className={`role-badge role-${user?.role}`}>{user?.role}</span>
          <button
            onClick={onLogout}
            style={{
              background: 'none', border: '1px solid #334155', borderRadius: 6,
              color: '#94A3B8', fontSize: 12, padding: '4px 10px', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.target.style.background = '#DC2626'; e.target.style.color = '#fff'; e.target.style.borderColor = '#DC2626'; }}
            onMouseLeave={e => { e.target.style.background = 'none'; e.target.style.color = '#94A3B8'; e.target.style.borderColor = '#334155'; }}
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
