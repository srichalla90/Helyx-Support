import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { useToast } from '../components/Toast';

// ── Type config ───────────────────────────────────────────────────────────────

const TYPE_CFG = {
  admin:     { label: 'Admin',            bg: '#1E293B', text: '#fff',     border: '#1E293B' },
  agent:     { label: 'Agent',            bg: '#EFF6FF', text: '#1D4ED8',  border: '#BFDBFE' },
  customer:  { label: 'Customer User',    bg: '#F0FDF4', text: '#15803D',  border: '#BBF7D0' },
  contact:   { label: 'Customer Contact', bg: '#F5F3FF', text: '#6D28D9',  border: '#DDD6FE' },
  requester: { label: 'Email Requester',  bg: '#FFF7ED', text: '#C2410C',  border: '#FED7AA' },
};

const TABS = [
  { key: 'all',        label: 'All' },
  { key: 'staff',      label: 'Agents & Admins', types: ['admin', 'agent'] },
  { key: 'customers',  label: 'Customer Contacts', types: ['customer', 'contact'] },
  { key: 'requester',  label: 'Email Only', types: ['requester'] },
];

function TypeBadge({ type }) {
  const cfg = TYPE_CFG[type] || TYPE_CFG.requester;
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 600,
      background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`,
      borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

function Avatar({ name, email, size = 32 }) {
  const initials = name && name !== email
    ? name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : (email || '?')[0].toUpperCase();

  // Deterministic pastel from email
  let hash = 0;
  for (let i = 0; i < (email || '').length; i++) hash = (email.charCodeAt(i) + ((hash << 5) - hash)) | 0;
  const hue = Math.abs(hash) % 360;
  const bg  = `hsl(${hue}, 55%, 88%)`;
  const fg  = `hsl(${hue}, 55%, 28%)`;

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, color: fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  const now  = new Date();
  const diff = now - date;
  if (diff < 86400000) return 'Today';
  if (diff < 172800000) return 'Yesterday';
  if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const toast = useToast();
  const [contacts, setContacts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [tab,      setTab]      = useState('all');
  const [sortKey,  setSortKey]  = useState('name');
  const [sortDir,  setSortDir]  = useState('asc');

  useEffect(() => {
    api.getContacts()
      .then(setContacts)
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const filtered = useMemo(() => {
    const activeTab = TABS.find((t) => t.key === tab);
    const q = search.toLowerCase();

    return contacts
      .filter((c) => {
        if (activeTab?.types && !activeTab.types.includes(c.type)) return false;
        if (q && !c.name?.toLowerCase().includes(q) && !c.email?.toLowerCase().includes(q) && !c.company?.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        let va, vb;
        if (sortKey === 'name')          { va = (a.name  || a.email).toLowerCase(); vb = (b.name  || b.email).toLowerCase(); }
        else if (sortKey === 'email')    { va = a.email.toLowerCase();               vb = b.email.toLowerCase(); }
        else if (sortKey === 'company')  { va = (a.company || '').toLowerCase();     vb = (b.company || '').toLowerCase(); }
        else if (sortKey === 'tickets')  { va = a.ticket_count || 0;                 vb = b.ticket_count || 0; }
        else if (sortKey === 'last')     { va = a.last_ticket_at || '';              vb = b.last_ticket_at || ''; }
        else { va = ''; vb = ''; }
        const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [contacts, tab, search, sortKey, sortDir]);

  // Tab counts
  const counts = useMemo(() => {
    const out = { all: contacts.length };
    for (const t of TABS.slice(1)) {
      out[t.key] = contacts.filter((c) => t.types.includes(c.type)).length;
    }
    return out;
  }, [contacts]);

  function SortIcon({ col }) {
    if (sortKey !== col) return <span style={{ color: '#D1D5DB', marginLeft: 4 }}>↕</span>;
    return <span style={{ color: '#1E293B', marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  const thStyle = (col) => ({
    padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left',
    cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
    background: '#F8FAFC', borderBottom: '1px solid #E5E7EB',
  });

  if (loading) return <div style={{ color: '#9CA3AF', padding: 32, textAlign: 'center' }}>Loading contacts…</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Contacts</h2>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0' }}>
            Everyone who has interacted with your support system — {contacts.length} total
          </p>
        </div>
        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or company…"
          style={{
            padding: '8px 14px', fontSize: 13, border: '1px solid #D1D5DB',
            borderRadius: 8, outline: 'none', width: 280, fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #E5E7EB', marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: 'none', borderBottom: tab === t.key ? '2px solid #1E293B' : '2px solid transparent',
              background: 'none', color: tab === t.key ? '#1E293B' : '#6B7280',
              marginBottom: -1, transition: 'color 0.15s',
            }}
          >
            {t.label}
            <span style={{
              marginLeft: 6, fontSize: 11, fontWeight: 700,
              background: tab === t.key ? '#1E293B' : '#F3F4F6',
              color: tab === t.key ? '#fff' : '#6B7280',
              borderRadius: 20, padding: '1px 7px',
            }}>
              {counts[t.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9CA3AF', fontSize: 14 }}>
          {search ? 'No contacts match your search.' : 'No contacts in this category yet.'}
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle('name')} onClick={() => toggleSort('name')}>
                  Name / Email <SortIcon col="name" />
                </th>
                <th style={{ ...thStyle('type'), cursor: 'default' }}>Type</th>
                <th style={thStyle('company')} onClick={() => toggleSort('company')}>
                  Company <SortIcon col="company" />
                </th>
                <th style={{ ...thStyle('tickets'), textAlign: 'right' }} onClick={() => toggleSort('tickets')}>
                  Tickets <SortIcon col="tickets" />
                </th>
                <th style={thStyle('last')} onClick={() => toggleSort('last')}>
                  Last Ticket <SortIcon col="last" />
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr
                  key={c.id}
                  style={{
                    borderTop: i === 0 ? 'none' : '1px solid #F3F4F6',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={(e) => e.currentTarget.style.background = ''}
                >
                  {/* Name / Email */}
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={c.name} email={c.email} size={34} />
                      <div>
                        {c.name && c.name !== c.email ? (
                          <>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{c.name}</div>
                            <div style={{ fontSize: 12, color: '#6B7280' }}>{c.email}</div>
                          </>
                        ) : (
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{c.email}</div>
                        )}
                        {c.job_title && (
                          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{c.job_title}</div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Type */}
                  <td style={{ padding: '12px 16px' }}>
                    <TypeBadge type={c.type} />
                    {c.active === 0 && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: '#9CA3AF' }}>inactive</span>
                    )}
                  </td>

                  {/* Company */}
                  <td style={{ padding: '12px 16px', fontSize: 13, color: c.company ? '#374151' : '#D1D5DB' }}>
                    {c.company || '—'}
                  </td>

                  {/* Tickets */}
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    {c.ticket_count > 0 ? (
                      <span style={{
                        display: 'inline-block', fontSize: 12, fontWeight: 600,
                        background: '#F1F5F9', color: '#475569',
                        borderRadius: 20, padding: '2px 10px', minWidth: 28, textAlign: 'center',
                      }}>
                        {c.ticket_count}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: '#D1D5DB' }}>0</span>
                    )}
                  </td>

                  {/* Last ticket */}
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#6B7280' }}>
                    {fmtDate(c.last_ticket_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
        {Object.entries(TYPE_CFG).map(([key, cfg]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6B7280' }}>
            <span style={{
              display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: cfg.bg === '#fff' ? cfg.border : cfg.bg,
              border: `1px solid ${cfg.border}`,
            }} />
            {cfg.label}
          </div>
        ))}
      </div>
    </div>
  );
}
