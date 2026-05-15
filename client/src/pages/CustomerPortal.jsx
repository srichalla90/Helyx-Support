import { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { api, TICKET_TYPES, PRODUCTS, PRIORITIES } from '../api';
import { PriorityBadge } from '../components/StatusBadge';
import { useUser } from '../context/UserContext';
import { useToast } from '../components/Toast';
import KnowledgeBasePage from './KnowledgeBasePage';
import { ANNOUNCEMENT_TYPES } from './AnnouncementsPage';
import { FEATURE_STATUSES } from './FeatureRequestsPage';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const ACTIVE_STATUSES = new Set([
  'Pending', 'In Investigation', 'Pending Engineering',
  'Waiting on Customer', 'Pending Release',
]);

// ── Customer-facing status mapping ────────────────────────────────────────────
const CUSTOMER_STATUS_MAP = {
  'Open':                'Open',
  'Pending':             'In Progress',
  'In Investigation':    'In Progress',
  'Pending Engineering': 'In Progress',
  'Pending Release':     'In Progress',
  'Waiting on Customer': 'Waiting on You',
  'Resolved':            'Resolved',
  'Closed':              'Closed',
  'Canceled':            'Canceled',
};

const CUSTOMER_STATUS_STYLE = {
  'Open':           { bg: '#EFF6FF', color: '#1E293B', dot: '#3B82F6' },
  'In Progress':    { bg: '#FFF7ED', color: '#92400E', dot: '#F59E0B' },
  'Waiting on You': { bg: '#FEF3C7', color: '#78350F', dot: '#F59E0B' },
  'Resolved':       { bg: '#F0FDF4', color: '#065F46', dot: '#10B981' },
  'Closed':         { bg: '#F9FAFB', color: '#374151', dot: '#9CA3AF' },
  'Canceled':       { bg: '#FEF2F2', color: '#991B1B', dot: '#EF4444' },
};

function CustomerStatusBadge({ status }) {
  const label = CUSTOMER_STATUS_MAP[status] || status;
  const s = CUSTOMER_STATUS_STYLE[label] || { bg: '#F3F4F6', color: '#374151', dot: '#9CA3AF' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 600,
      padding: '3px 9px', borderRadius: 999,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {label}
    </span>
  );
}

// ── Shared portal header ──────────────────────────────────────────────────────

function PortalHeader({ view, onNav, onLogout, userName, newCount = 0, isStaffUser = false }) {
  const NAV = [
    { id: 'home',    label: 'Home',           icon: '🏠' },
    { id: 'tickets', label: 'My Tickets',     icon: '🎫' },
    { id: 'kb',      label: 'Knowledge Base', icon: '📚' },
    { id: 'updates', label: "What's New",     icon: '📣', badge: newCount },
    { id: 'ideas',   label: 'Ideas Board',   icon: '💡' },
  ];
  return (
    <header style={{
      background: '#1E293B', borderBottom: '1px solid #334155',
      padding: '0 32px', height: 56,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      position: 'sticky', top: 0, zIndex: 100, flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => onNav('home')}>
        <img
          src="/Helyx Logo.png"
          alt="Helyx"
          style={{ height: 36, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
        />
      </div>

      {/* Nav tabs */}
      <nav style={{ display: 'flex', gap: 2 }}>
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => onNav(n.id)}
            style={{
              padding: '6px 16px', fontSize: 13, fontWeight: 600,
              borderRadius: 7, border: 'none', cursor: 'pointer',
              background: view === n.id ? '#0F172A' : 'transparent',
              color:      view === n.id ? '#93C5FD' : '#94A3B8',
              transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
            onMouseEnter={(e) => { if (view !== n.id) e.currentTarget.style.background = '#293548'; e.currentTarget.style.color = '#E2E8F0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = view === n.id ? '#0F172A' : 'transparent'; e.currentTarget.style.color = view === n.id ? '#93C5FD' : '#94A3B8'; }}
          >
            {n.icon} {n.label}
            {n.badge > 0 && (
              <span style={{ background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 99, padding: '1px 6px', lineHeight: 1.5 }}>
                {n.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* User + sign out */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {isStaffUser && (
          <button
            onClick={() => { window.location.href = window.location.origin + window.location.pathname; }}
            style={{
              fontSize: 12, fontWeight: 600, padding: '5px 12px',
              border: '1px solid #3B82F6', borderRadius: 6, cursor: 'pointer',
              background: 'rgba(59,130,246,0.12)', color: '#93C5FD', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#3B82F6'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#3B82F6'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(59,130,246,0.12)'; e.currentTarget.style.color = '#93C5FD'; e.currentTarget.style.borderColor = '#3B82F6'; }}
          >
            ← Agent Portal
          </button>
        )}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9' }}>{userName}</div>
        </div>
        <button
          onClick={onLogout}
          style={{
            fontSize: 12, fontWeight: 600, padding: '5px 12px',
            border: '1px solid #334155', borderRadius: 6, cursor: 'pointer',
            background: 'none', color: '#94A3B8', transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#DC2626'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#DC2626'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.borderColor = '#334155'; }}
        >Sign out</button>
      </div>
    </header>
  );
}

// ── Announcement components ───────────────────────────────────────────────────

function AnnouncementTypeBadge({ type }) {
  const cfg = ANNOUNCEMENT_TYPES[type] || ANNOUNCEMENT_TYPES.general;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600,
      background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`,
      borderRadius: 20, padding: '2px 10px',
    }}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}

function fmtDateShort(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Pinned banner shown above the hero
function PinnedBanner({ announcement, onView }) {
  const cfg = ANNOUNCEMENT_TYPES[announcement.type] || ANNOUNCEMENT_TYPES.general;
  return (
    <div style={{
      background: `linear-gradient(135deg, ${cfg.bg}, #fff)`,
      border: `1px solid ${cfg.border}`,
      borderRadius: 0,
      padding: '12px 32px',
      display: 'flex', alignItems: 'center', gap: 14,
      cursor: 'pointer',
    }}
    onClick={onView}
    >
      <span style={{ fontSize: 22, flexShrink: 0 }}>{cfg.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: cfg.text, marginRight: 8 }}>📌 Pinned</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{announcement.title}</span>
        {announcement.body && (
          <span style={{ fontSize: 13, color: '#6B7280', marginLeft: 8 }}>
            — {announcement.body.replace(/<[^>]*>/g, '').slice(0, 80)}…
          </span>
        )}
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: cfg.text, flexShrink: 0, whiteSpace: 'nowrap' }}>
        Read more →
      </span>
    </div>
  );
}

// Full "What's New" feed page
function UpdatesFeed({ announcements, onSelect }) {
  const [filter, setFilter] = useState('all');
  const types = ['all', ...Object.keys(ANNOUNCEMENT_TYPES)];

  const shown = filter === 'all'
    ? announcements
    : announcements.filter((a) => a.type === filter);

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>What's New</h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>Latest product updates, features, and announcements</p>
        </div>
        {/* Type filter */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {types.map((t) => {
            const cfg = t === 'all' ? null : ANNOUNCEMENT_TYPES[t];
            const isActive = filter === t;
            return (
              <button key={t} onClick={() => setFilter(t)} style={{
                padding: '4px 12px', fontSize: 12, fontWeight: 600, borderRadius: 20, cursor: 'pointer',
                background: isActive ? (cfg ? cfg.bg : '#1E293B') : '#fff',
                color:      isActive ? (cfg ? cfg.text : '#fff') : '#6B7280',
                border:     `1px solid ${isActive ? (cfg ? cfg.border : '#1E293B') : '#E5E7EB'}`,
              }}>
                {cfg ? `${cfg.emoji} ${cfg.label}` : 'All Updates'}
              </button>
            );
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '56px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📣</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>No updates yet</p>
          <p style={{ fontSize: 13, color: '#9CA3AF', marginTop: 4 }}>Check back soon for the latest news.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {shown.map((ann) => {
            const cfg = ANNOUNCEMENT_TYPES[ann.type] || ANNOUNCEMENT_TYPES.general;
            return (
              <div
                key={ann.id}
                onClick={() => onSelect(ann)}
                style={{
                  background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB',
                  padding: '20px 24px', cursor: 'pointer',
                  borderLeft: `4px solid ${cfg.border}`,
                  transition: 'box-shadow 0.15s, transform 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.07)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ fontSize: 28, flexShrink: 0 }}>{cfg.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <AnnouncementTypeBadge type={ann.type} />
                      {ann.pinned === 1 && <span style={{ fontSize: 11, color: '#9CA3AF' }}>📌 Pinned</span>}
                      <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 'auto' }}>{fmtDateShort(ann.published_at)}</span>
                    </div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 6 }}>{ann.title}</h3>
                    {ann.body && (
                      <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6, margin: 0,
                        overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(ann.body.replace(/<[^>]*>/g, ' ').slice(0, 200)) }}
                      />
                    )}
                    <div style={{ fontSize: 12, fontWeight: 600, color: cfg.text, marginTop: 10 }}>Read more →</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Single announcement detail view
function AnnouncementDetail({ announcement, onBack }) {
  const cfg = ANNOUNCEMENT_TYPES[announcement.type] || ANNOUNCEMENT_TYPES.general;
  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, cursor: 'pointer', marginBottom: 20, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
        ← Back to What's New
      </button>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
        {/* Colored header strip */}
        <div style={{ background: cfg.bg, borderBottom: `1px solid ${cfg.border}`, padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 32 }}>{cfg.emoji}</span>
            <AnnouncementTypeBadge type={announcement.type} />
            {announcement.pinned === 1 && <span style={{ fontSize: 12, color: '#6B7280' }}>📌 Pinned</span>}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 6 }}>{announcement.title}</h1>
          <div style={{ fontSize: 12, color: '#9CA3AF' }}>
            {fmtDateShort(announcement.published_at)}
          </div>
        </div>
        {/* Body */}
        <div
          style={{ padding: '28px', fontSize: 14, lineHeight: 1.8, color: '#1F2937' }}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(announcement.body || '<p style="color:#9CA3AF">No content.</p>') }}
        />
      </div>
    </div>
  );
}

// ── New ticket form ───────────────────────────────────────────────────────────

function NewTicketForm({ onCreated, onCancel, requesterEmail }) {
  const [form, setForm] = useState({
    title: '', description: '', type: 'Question / How-To',
    product: '', priority: 'Medium', requester_email: requesterEmail,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const toast = useToast();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setSaving(true); setError('');
    try {
      const ticket = await api.createTicket({ ...form, source: 'manual' });
      toast('Ticket submitted!', 'success');
      onCreated(ticket);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, cursor: 'pointer', marginBottom: 20, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
        ← Back
      </button>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Submit a Support Ticket</h2>
        <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 24 }}>Our team usually responds within a few hours.</p>
        <form onSubmit={submit}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Subject *</label>
            <input value={form.title} onChange={set('title')} placeholder="Briefly describe your issue"
              autoFocus style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14 }} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Description</label>
            <textarea value={form.description} onChange={set('description')} rows={5}
              placeholder="Provide as much detail as possible…"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 18 }}>
            {[
              { key: 'type', label: 'Type', opts: TICKET_TYPES.map(t => ({ v: t, l: t })) },
              { key: 'product', label: 'Product', opts: [{ v: '', l: '— Not sure —' }, ...PRODUCTS.map(p => ({ v: p, l: p }))] },
              { key: 'priority', label: 'Priority', opts: PRIORITIES.map(p => ({ v: p, l: p })) },
            ].map(({ key, label, opts }) => (
              <div key={key}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>{label}</label>
                <select value={form[key]} onChange={set(key)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13 }}>
                  {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            ))}
          </div>
          {error && <p style={{ color: '#DC2626', fontSize: 13, marginBottom: 14 }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Submitting…' : 'Submit Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Ticket detail ─────────────────────────────────────────────────────────────

function CustomerTicketDetail({ ticket: initial, onBack }) {
  const user = useUser();
  const [ticket, setTicket] = useState(initial);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [loadingFull, setLoadingFull] = useState(true);
  const toast = useToast();

  useEffect(() => {
    api.getTicket(initial.id, { public_only: '1' })
      .then((t) => setTicket({ ...t, comments: (t.comments || []).filter((c) => c.is_public !== 0) }))
      .catch(() => {})
      .finally(() => setLoadingFull(false));
  }, [initial.id]);

  async function postComment() {
    if (!comment.trim()) return;
    setPosting(true);
    try {
      const c = await api.addComment(ticket.id, { author: user.name, author_role: 'customer', body: comment, is_public: true });
      setTicket((prev) => ({ ...prev, comments: [...(prev.comments || []), c] }));
      setComment('');
      toast('Reply sent', 'success');
    } catch (e) { toast(e.message, 'error'); }
    finally { setPosting(false); }
  }

  if (loadingFull) return <div className="loading"><div className="spinner" /> Loading…</div>;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, cursor: 'pointer', marginBottom: 20, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
        ← Back to my tickets
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 20, alignItems: 'flex-start' }}>
        <div>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 24, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 6 }}>Ticket #{ticket.id}</div>
            <h2 style={{ fontSize: 19, fontWeight: 700, color: '#111827', marginBottom: 10 }}>{ticket.title}</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <CustomerStatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              {ticket.product && <span style={{ fontSize: 12, color: '#6B7280', background: '#F3F4F6', padding: '2px 8px', borderRadius: 4 }}>{ticket.product}</span>}
            </div>
            <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.7 }}>
              {ticket.description || <em style={{ color: '#9CA3AF' }}>No description provided.</em>}
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 16 }}>
              Activity {(ticket.comments || []).length > 0 && `(${ticket.comments.length})`}
            </h3>
            {(ticket.comments || []).length === 0 && (
              <p style={{ color: '#9CA3AF', fontSize: 13 }}>No replies yet — our team will respond shortly.</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {(ticket.comments || []).map((c) => {
                // Treat as support if role is explicitly agent/admin, OR if no role is stored
                // and the author isn't the currently logged-in customer (backward-compat fallback)
                const isSupport = c.author_role
                  ? (c.author_role === 'agent' || c.author_role === 'admin')
                  : c.author !== user.name;
                const displayName = isSupport ? 'Helyx Team' : c.author;
                const avatarBg = isSupport
                  ? 'linear-gradient(135deg, #1D4ED8, #7C3AED)'
                  : 'linear-gradient(135deg, #059669, #0891B2)';
                const avatarInitial = isSupport ? 'HT' : (c.author || '?')[0].toUpperCase();
                return (
                  <div key={c.id} style={{ display: 'flex', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {avatarInitial}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{displayName}</span>
                        <span style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtDateTime(c.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, background: '#F9FAFB', borderRadius: 8, padding: '10px 14px' }}>{c.body}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 16 }}>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
                placeholder="Add a reply or more details…"
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postComment(); }}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, resize: 'vertical', marginBottom: 10 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>⌘+Enter to submit</span>
                <button className="btn btn-primary btn-sm" onClick={postComment} disabled={posting || !comment.trim()}>
                  {posting ? 'Sending…' : 'Send Reply'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar meta */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 20 }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16 }}>Details</h3>
          {[
            { label: 'Status',   value: <CustomerStatusBadge status={ticket.status} /> },
            { label: 'Priority', value: <PriorityBadge priority={ticket.priority} /> },
            { label: 'Type',     value: ticket.type },
            { label: 'Product',  value: ticket.product || '—' },
            { label: 'Opened',   value: fmtDate(ticket.created_at) },
            { label: 'Updated',  value: fmtDate(ticket.updated_at) },
          ].map(({ label, value }) => (
            <div key={label} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 13, color: '#374151' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Ticket list (full view) ───────────────────────────────────────────────────

function TicketListView({ tickets, loading, onSelect, onNew }) {
  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 700, color: '#111827' }}>My Support Tickets</h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>
            {loading ? 'Loading…' : `${tickets.length} ticket${tickets.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button className="btn btn-primary" onClick={onNew}>+ New Ticket</button>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /> Loading your tickets…</div>
      ) : tickets.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '56px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎫</div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 8 }}>No tickets yet</h3>
          <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 20 }}>Submit a request and we'll get back to you.</p>
          <button className="btn btn-primary" onClick={onNew}>Submit your first ticket</button>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          {tickets.map((t, i) => (
            <div
              key={t.id}
              onClick={() => onSelect(t)}
              style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px',
                borderBottom: i < tickets.length - 1 ? '1px solid #F3F4F6' : 'none',
                cursor: 'pointer', transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#F9FAFB'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#111827', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>#{t.id} · {t.type} · {fmtDate(t.created_at)}{t.product ? ` · ${t.product}` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <CustomerStatusBadge status={t.status} />
                <PriorityBadge priority={t.priority} />
                <span style={{ color: '#D1D5DB', fontSize: 16 }}>›</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Home dashboard ────────────────────────────────────────────────────────────

function HomeDashboard({ user, tickets, kbFolders, announcements, loading, onNav, onSelectTicket, onNewTicket, onSelectAnnouncement }) {
  const open     = tickets.filter((t) => t.status === 'Open').length;
  const active   = tickets.filter((t) => ACTIVE_STATUSES.has(t.status)).length;
  const resolved = tickets.filter((t) => t.status === 'Resolved' || t.status === 'Closed').length;
  const recent   = tickets.slice(0, 5);
  const firstName = user.name?.split(' ')[0] || user.name;

  const pinned  = announcements.find((a) => a.pinned === 1);
  const recent3 = announcements.filter((a) => !a.pinned || announcements.indexOf(a) > 0).slice(0, 3);

  return (
    <div>
      {/* ── Pinned announcement banner ── */}
      {pinned && (
        <PinnedBanner announcement={pinned} onView={() => onSelectAnnouncement(pinned)} />
      )}

      {/* ── Hero ── */}
      <div style={{
        background: '#1E293B',
        padding: '48px 32px 52px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'absolute', bottom: -60, right: 80, width: 280, height: 280, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />

        <div style={{ maxWidth: 720, margin: '0 auto', position: 'relative' }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 500, marginBottom: 8 }}>
            Welcome back 👋
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', marginBottom: 10, letterSpacing: '-0.5px' }}>
            Hi, {firstName}. How can we help?
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.75)', marginBottom: 28, maxWidth: 480 }}>
            Get support, track your requests, and explore our knowledge base — all in one place.
          </p>

          {/* CTA buttons */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 36 }}>
            <button
              onClick={onNewTicket}
              style={{
                padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                background: '#fff', color: '#1E293B', border: 'none', borderRadius: 9,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                display: 'flex', alignItems: 'center', gap: 7,
              }}
            >
              🎫 Submit a Ticket
            </button>
            <button
              onClick={() => onNav('kb')}
              style={{
                padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                background: 'rgba(255,255,255,0.15)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.3)', borderRadius: 9,
                display: 'flex', alignItems: 'center', gap: 7,
                backdropFilter: 'blur(4px)',
              }}
            >
              📚 Knowledge Base
            </button>
          </div>

          {/* Stats row */}
          {tickets.length > 0 && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { label: 'Open',        count: open,     color: '#BFDBFE', bg: 'rgba(255,255,255,0.12)' },
                { label: 'In Progress', count: active,   color: '#FDE68A', bg: 'rgba(255,255,255,0.12)' },
                { label: 'Resolved',    count: resolved, color: '#A7F3D0', bg: 'rgba(255,255,255,0.12)' },
              ].map(({ label, count, color, bg }) => (
                <div key={label} onClick={() => onNav('tickets')} style={{
                  background: bg, borderRadius: 8, padding: '8px 16px',
                  border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s',
                }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{count}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Body cards ── */}
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '28px 32px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 20, alignItems: 'flex-start' }}>

        {/* Recent tickets card */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden', order: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px', borderBottom: '1px solid #F3F4F6' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Recent Tickets</h2>
            {tickets.length > 0 && (
              <button onClick={() => onNav('tickets')} style={{ background: 'none', border: 'none', color: '#1E293B', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                View all {tickets.length} →
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Loading tickets…</div>
          ) : recent.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🎫</div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>No tickets yet</p>
              <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 16 }}>Submit a request and we'll get back to you quickly.</p>
              <button className="btn btn-primary btn-sm" onClick={onNewTicket}>Submit a Ticket</button>
            </div>
          ) : (
            <>
              {recent.map((t, i) => (
                <div
                  key={t.id}
                  onClick={() => onSelectTicket(t)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px',
                    borderBottom: i < recent.length - 1 ? '1px solid #F9FAFB' : 'none',
                    cursor: 'pointer', transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#FAFAFA'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                      {t.title}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#9CA3AF' }}>#{t.id} · {fmtDate(t.created_at)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    <CustomerStatusBadge status={t.status} />
                    <span style={{ color: '#D1D5DB' }}>›</span>
                  </div>
                </div>
              ))}
              <div style={{ padding: '12px 20px', background: '#F9FAFB' }}>
                <button onClick={onNewTicket} style={{
                  width: '100%', padding: '9px', fontSize: 13, fontWeight: 600,
                  background: '#fff', color: '#374151', border: '1px solid #E5E7EB',
                  borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  + Submit a new ticket
                </button>
              </div>
            </>
          )}
        </div>

        {/* Knowledge base card */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden', order: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px', borderBottom: '1px solid #F3F4F6' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Knowledge Base</h2>
            {kbFolders.length > 0 && (
              <button onClick={() => onNav('kb')} style={{ background: 'none', border: 'none', color: '#1E293B', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                Browse all →
              </button>
            )}
          </div>

          {kbFolders.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📚</div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Coming soon</p>
              <p style={{ fontSize: 13, color: '#9CA3AF' }}>Our team is building the knowledge base. Check back soon!</p>
            </div>
          ) : (
            <>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {kbFolders.slice(0, 7).map((f) => (
                  <div
                    key={f.id}
                    onClick={() => onNav('kb')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      borderRadius: 8, cursor: 'pointer', transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#F9FAFB'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontSize: 18 }}>📁</span>
                    <span style={{ fontSize: 13.5, fontWeight: 500, color: '#374151', flex: 1 }}>{f.name}</span>
                    <span style={{ color: '#D1D5DB', fontSize: 14 }}>›</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid #F3F4F6', background: '#F9FAFB' }}>
                <button onClick={() => onNav('kb')} style={{
                  width: '100%', padding: '9px', fontSize: 13, fontWeight: 600,
                  background: '#fff', color: '#374151', border: '1px solid #E5E7EB',
                  borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  📚 Browse all articles
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── What's New card (3rd column) ── */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden', order: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px', borderBottom: '1px solid #F3F4F6' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>What's New</h2>
            {recent3.length > 0 && (
              <button onClick={() => onNav('updates')} style={{ background: 'none', border: 'none', color: '#1E293B', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                View all →
              </button>
            )}
          </div>

          {recent3.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📣</div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>No updates yet</p>
              <p style={{ fontSize: 13, color: '#9CA3AF' }}>Check back soon for the latest news.</p>
            </div>
          ) : (
            <>
              <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column' }}>
                {recent3.map((ann, i) => {
                  const cfg = ANNOUNCEMENT_TYPES[ann.type] || ANNOUNCEMENT_TYPES.general;
                  return (
                    <div
                      key={ann.id}
                      onClick={() => onSelectAnnouncement(ann)}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 20px',
                        borderBottom: i < recent3.length - 1 ? '1px solid #F9FAFB' : 'none',
                        cursor: 'pointer', transition: 'background 0.1s',
                        borderLeft: `3px solid ${cfg.border}`,
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#FAFAFA'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{cfg.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ marginBottom: 3 }}>
                          <AnnouncementTypeBadge type={ann.type} />
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                          {ann.title}
                        </div>
                        <div style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtDateShort(ann.published_at)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid #F3F4F6', background: '#F9FAFB' }}>
                <button onClick={() => onNav('updates')} style={{
                  width: '100%', padding: '9px', fontSize: 13, fontWeight: 600,
                  background: '#fff', color: '#374151', border: '1px solid #E5E7EB',
                  borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  📣 View all updates
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Ideas Board (customer view) ───────────────────────────────────────────────

function FeatureStatusBadge({ status }) {
  const cfg = FEATURE_STATUSES[status] || FEATURE_STATUSES.submitted;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
      padding: '2px 10px', borderRadius: 20,
      background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}

// Submit idea form
function SubmitIdeaForm({ userEmail, userName, onSubmitted, onCancel }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const idea = await api.submitFeatureRequest({
        title: title.trim(),
        description: description.trim(),
        submitter_email: userEmail,
        submitter_name: userName,
      });
      toast('Idea submitted! Thanks for your feedback.', 'success');
      onSubmitted(idea);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, cursor: 'pointer', marginBottom: 20, padding: 0 }}>
        ← Back to Ideas Board
      </button>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 32 }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>💡</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Share an Idea</h2>
        <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 24 }}>
          Have a feature request or suggestion? Share it with us and let the community vote!
        </p>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Title *</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="A short, clear title for your idea"
              autoFocus
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Details (optional)</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              rows={5} placeholder="Describe the problem this solves, or how it would work…"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 18 }}>
            💬 Your idea will appear anonymously to other community members.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={onCancel} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !title.trim()} style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: saving || !title.trim() ? '#D1D5DB' : '#1E293B',
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              {saving ? 'Submitting…' : '💡 Submit Idea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Single idea detail
function IdeaDetail({ idea: initial, userEmail, onBack, onVoteToggle }) {
  const { showToast } = useToast();
  const [idea, setIdea] = useState(initial);
  const [commentBody, setCommentBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [voting, setVoting] = useState(false);

  // Load full detail (with comments)
  useEffect(() => {
    api.getFeatureRequest(initial.id, { caller: 'customer' })
      .then(setIdea)
      .catch(() => {});
  }, [initial.id]);

  async function handleVote() {
    setVoting(true);
    try {
      const res = await api.voteFeatureRequest(idea.id, { voter_email: userEmail });
      setIdea(d => ({ ...d, vote_count: res.vote_count, _voted: res.voted }));
      onVoteToggle(idea.id, res);
    } catch (e) { showToast(e.message, 'error'); }
    finally { setVoting(false); }
  }

  async function handleComment(e) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setPosting(true);
    try {
      await api.addFeatureComment(idea.id, {
        author: 'Community Member',
        author_email: userEmail,
        body: commentBody.trim(),
        is_official: false,
      });
      setCommentBody('');
      // Refresh comments
      api.getFeatureRequest(idea.id, { caller: 'customer' }).then(setIdea).catch(() => {});
    } catch (e) { showToast(e.message, 'error'); }
    finally { setPosting(false); }
  }

  const comments = idea.comments || [];
  const voted = idea._voted;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, cursor: 'pointer', marginBottom: 20, padding: 0 }}>
        ← Back to Ideas Board
      </button>

      {/* Main card */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 28, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 10 }}>{idea.title}</h2>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <FeatureStatusBadge status={idea.status} />
              <span style={{ fontSize: 12, color: '#9CA3AF' }}>by {idea.submitter_name || 'Community Member'}</span>
            </div>
          </div>
          {/* Vote button */}
          <button
            onClick={handleVote}
            disabled={voting}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '12px 18px', borderRadius: 10, cursor: 'pointer',
              background: voted ? '#EFF6FF' : '#fff',
              border: voted ? '2px solid #3B82F6' : '2px solid #E5E7EB',
              color: voted ? '#1D4ED8' : '#374151',
              fontWeight: 700, transition: 'all 0.15s', minWidth: 64,
            }}
          >
            <span style={{ fontSize: 20 }}>👍</span>
            <span style={{ fontSize: 18 }}>{idea.vote_count}</span>
            <span style={{ fontSize: 10, fontWeight: 600 }}>{voted ? 'Voted' : 'Upvote'}</span>
          </button>
        </div>
        {idea.description && (
          <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: 0 }}>{idea.description}</p>
        )}
      </div>

      {/* Comments */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 20 }}>
          💬 Discussion {comments.length > 0 && `(${comments.length})`}
        </h3>

        {comments.length === 0 ? (
          <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 20 }}>No comments yet. Be the first to add context!</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
            {comments.map((c, i) => (
              <div key={c.id || i} style={{
                padding: '14px 16px', borderRadius: 10,
                background: c.is_official === 1 ? '#EFF6FF' : '#F9FAFB',
                border: c.is_official === 1 ? '1px solid #BFDBFE' : '1px solid #F3F4F6',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  {/* Avatar */}
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    background: c.is_official === 1
                      ? 'linear-gradient(135deg, #1D4ED8, #7C3AED)'
                      : 'linear-gradient(135deg, #059669, #0891B2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 11, fontWeight: 700,
                  }}>
                    {c.is_official === 1 ? 'HT' : (c.author || 'C')[0].toUpperCase()}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                      {c.is_official === 1 ? 'Helyx Team' : (c.author || 'Community Member')}
                    </span>
                    {c.is_official === 1 && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: '#1D4ED8', color: '#fff', letterSpacing: '0.04em' }}>
                        HELYX
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                    {c.created_at ? new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.6, paddingLeft: 38 }}>{c.body}</p>
              </div>
            ))}
          </div>
        )}

        {/* Add comment */}
        <form onSubmit={handleComment} style={{ borderTop: '1px solid #F3F4F6', paddingTop: 16 }}>
          <textarea
            value={commentBody} onChange={e => setCommentBody(e.target.value)}
            rows={3} placeholder="Add a comment or share more details…"
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', marginBottom: 10 }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" disabled={posting || !commentBody.trim()} style={{
              padding: '7px 16px', borderRadius: 8, border: 'none',
              background: posting || !commentBody.trim() ? '#D1D5DB' : '#1E293B',
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              {posting ? 'Posting…' : 'Post Comment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Main ideas list
function IdeasBoard({ userEmail, userName }) {
  const { showToast } = useToast();
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'submit' | 'detail'
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');
  const [votedIds, setVotedIds] = useState({});

  useEffect(() => {
    api.getFeatureRequests({ caller: 'customer' })
      .then(rows => {
        setFeatures(rows);
        // Track which ones user has voted on by checking the voter list isn't exposed;
        // we'll detect via the voteFeatureRequest response if they try to vote
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleVoteToggle(id, result) {
    setVotedIds(v => ({ ...v, [id]: result.voted }));
    setFeatures(fs => fs.map(f => f.id === id ? { ...f, vote_count: result.vote_count } : f));
  }

  async function handleVote(e, feature) {
    e.stopPropagation();
    try {
      const res = await api.voteFeatureRequest(feature.id, { voter_email: userEmail });
      handleVoteToggle(feature.id, res);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function openIdea(f) {
    setSelected(f);
    setView('detail');
  }

  if (view === 'submit') {
    return (
      <SubmitIdeaForm
        userEmail={userEmail}
        userName={userName}
        onSubmitted={(idea) => { setFeatures(fs => [idea, ...fs]); setView('list'); }}
        onCancel={() => setView('list')}
      />
    );
  }

  if (view === 'detail' && selected) {
    return (
      <IdeaDetail
        idea={selected}
        userEmail={userEmail}
        onBack={() => setView('list')}
        onVoteToggle={handleVoteToggle}
      />
    );
  }

  const STATUS_FILTERS = ['all', 'submitted', 'under_review', 'planned', 'in_progress', 'shipped'];
  const shown = features.filter(f => {
    if (filter !== 'all' && f.status !== filter) return false;
    return true;
  });

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 4 }}>💡 Ideas Board</h2>
          <p style={{ fontSize: 13, color: '#6B7280' }}>
            Vote on ideas and suggest features you'd like to see. Your submissions appear anonymously.
          </p>
        </div>
        <button
          onClick={() => setView('submit')}
          style={{
            padding: '10px 20px', borderRadius: 9, border: 'none', fontWeight: 700,
            background: '#1E293B', color: '#fff', fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          💡 Share an Idea
        </button>
      </div>

      {/* Status filter pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {STATUS_FILTERS.map(s => {
          const cfg = s === 'all' ? null : FEATURE_STATUSES[s];
          const isActive = filter === s;
          return (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: '5px 14px', fontSize: 12, fontWeight: 600, borderRadius: 20, cursor: 'pointer',
              background: isActive ? (cfg ? cfg.bg : '#1E293B') : '#fff',
              color: isActive ? (cfg ? cfg.text : '#fff') : '#6B7280',
              border: `1px solid ${isActive ? (cfg ? cfg.border : '#1E293B') : '#E5E7EB'}`,
              transition: 'all 0.15s',
            }}>
              {cfg ? `${cfg.emoji} ${cfg.label}` : 'All Ideas'}
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 56, color: '#9CA3AF' }}>Loading…</div>
      ) : shown.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '56px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>💡</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            {features.length === 0 ? 'No ideas yet' : 'No results'}
          </p>
          <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 20 }}>
            {features.length === 0 ? 'Be the first to suggest a feature!' : 'Try a different filter.'}
          </p>
          {features.length === 0 && (
            <button onClick={() => setView('submit')} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#1E293B', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              💡 Share an Idea
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {shown.map(f => {
            const isVoted = votedIds[f.id] === true;
            return (
              <div
                key={f.id}
                onClick={() => openIdea(f)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px',
                  background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB',
                  cursor: 'pointer', transition: 'box-shadow 0.15s, transform 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
              >
                {/* Vote bubble */}
                <button
                  onClick={(e) => handleVote(e, f)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                    minWidth: 52, padding: '8px 4px', borderRadius: 10, cursor: 'pointer',
                    background: isVoted ? '#EFF6FF' : '#F9FAFB',
                    border: isVoted ? '1.5px solid #3B82F6' : '1.5px solid #E5E7EB',
                    color: isVoted ? '#1D4ED8' : '#6B7280',
                    transition: 'all 0.15s', flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 16 }}>👍</span>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{f.vote_count}</span>
                </button>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: '#111827', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.title}
                  </div>
                  {f.description && (
                    <div style={{ fontSize: 12.5, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.description}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                    by Community Member
                  </div>
                </div>

                <FeatureStatusBadge status={f.status} />
                <span style={{ color: '#D1D5DB', fontSize: 18 }}>›</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main portal ───────────────────────────────────────────────────────────────

export default function CustomerPortal({ onLogout }) {
  const user  = useUser();
  const toast = useToast();

  const [cpView, setCpView] = useState(() => {
    const v = sessionStorage.getItem('helyx_cp_view') || 'home';
    // redirect idea-detail to ideas if page was reloaded (no idea state)
    return (v === 'idea-detail') ? 'ideas' : v;
  });
  const [tickets,       setTickets]       = useState([]);
  const [kbFolders,     setKbFolders]     = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [selectedAnn,   setSelectedAnn]   = useState(null);
  const [seenAnnIds,    setSeenAnnIds]    = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('helyx_seen_ann') || '[]')); }
    catch { return new Set(); }
  });

  function markAnnouncementsSeen(ids) {
    setSeenAnnIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      localStorage.setItem('helyx_seen_ann', JSON.stringify([...next]));
      return next;
    });
  }

  const unreadAnnCount = announcements.filter((a) => !seenAnnIds.has(a.id)).length;
  const [selected,      setSelected]      = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('helyx_cp_selected') || 'null'); } catch { return null; }
  });
  const [loading,    setLoading]    = useState(true);

  async function loadTickets() {
    setLoading(true);
    try {
      const all = await api.getTickets({ requester_email: user.email });
      setTickets(all);
      // If we restored a selected ticket id from session, find the full object
      const storedId = sessionStorage.getItem('helyx_cp_selected_id');
      if (storedId) {
        const found = all.find((t) => t.id === Number(storedId));
        if (found) { setSelected(found); setCpView('ticket-detail'); }
      }
    } catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    loadTickets();
    api.getKbTree()
      .then(({ folders }) => setKbFolders(folders.filter((f) => f.parent_id == null)))
      .catch(() => {});
    api.getPublicAnnouncements()
      .then(setAnnouncements)
      .catch(() => {});
  }, []);

  function nav(view) {
    sessionStorage.setItem('helyx_cp_view', view);
    sessionStorage.removeItem('helyx_cp_selected_id');
    setSelected(null);
    setCpView(view);
    if (view === 'updates') {
      markAnnouncementsSeen(announcements.map((a) => a.id));
    }
  }

  function openTicket(t) {
    sessionStorage.setItem('helyx_cp_view', 'ticket-detail');
    sessionStorage.setItem('helyx_cp_selected_id', String(t.id));
    setSelected(t);
    setCpView('ticket-detail');
  }

  function goNewTicket() {
    sessionStorage.setItem('helyx_cp_view', 'new-ticket');
    setCpView('new-ticket');
  }

  function openAnnouncement(ann) {
    setSelectedAnn(ann);
    sessionStorage.setItem('helyx_cp_view', 'announcement-detail');
    setCpView('announcement-detail');
    markAnnouncementsSeen([ann.id]);
  }

  const pageContent = (() => {
    switch (cpView) {
      case 'home':
        return (
          <HomeDashboard
            user={user}
            tickets={tickets}
            kbFolders={kbFolders}
            announcements={announcements}
            loading={loading}
            onNav={nav}
            onSelectTicket={openTicket}
            onNewTicket={goNewTicket}
            onSelectAnnouncement={openAnnouncement}
          />
        );
      case 'tickets':
        return (
          <div style={{ padding: '28px 32px' }}>
            <TicketListView tickets={tickets} loading={loading} onSelect={openTicket} onNew={goNewTicket} />
          </div>
        );
      case 'new-ticket':
        return (
          <div style={{ padding: '28px 32px' }}>
            <NewTicketForm
              requesterEmail={user.email}
              onCreated={(t) => { loadTickets(); openTicket(t); }}
              onCancel={() => nav(tickets.length ? 'tickets' : 'home')}
            />
          </div>
        );
      case 'ticket-detail':
        return (
          <div style={{ padding: '28px 32px' }}>
            <CustomerTicketDetail ticket={selected} onBack={() => nav('tickets')} />
          </div>
        );
      case 'kb':
        return (
          <div style={{ padding: '28px 32px' }}>
            <KnowledgeBasePage readOnly />
          </div>
        );
      case 'updates':
        return (
          <div style={{ padding: '28px 32px' }}>
            <UpdatesFeed announcements={announcements} onSelect={openAnnouncement} />
          </div>
        );
      case 'announcement-detail':
        return selectedAnn ? (
          <div style={{ padding: '28px 32px' }}>
            <AnnouncementDetail announcement={selectedAnn} onBack={() => nav('updates')} />
          </div>
        ) : null;
      case 'ideas':
        return (
          <div style={{ padding: '28px 32px' }}>
            <IdeasBoard userEmail={user.email} userName={user.name} />
          </div>
        );
      default:
        return null;
    }
  })();

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', flexDirection: 'column' }}>
      <PortalHeader
        view={
          cpView === 'ticket-detail' || cpView === 'new-ticket' ? 'tickets'
          : cpView === 'announcement-detail' ? 'updates'
          : cpView
        }
        onNav={nav}
        onLogout={onLogout}
        userName={user.name}
        newCount={unreadAnnCount}
        isStaffUser={user.role === 'admin' || user.role === 'agent'}
      />
      <div style={{ flex: 1 }}>
        {pageContent}
      </div>
    </div>
  );
}
