import { useState, useEffect, useCallback, Component } from 'react';
import { api } from '../api';
import { useUser } from '../context/UserContext';
import { useProducts } from '../context/ProductsContext';

// ── Error boundary — prevents one broken widget from blanking the page ────────
class WidgetErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(err) { return { error: err }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '14px 18px', color: '#DC2626', fontSize: 12 }}>
          Widget error: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const MODULE = {
  tickets:     { label: 'Tickets',        icon: '🎫', color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE', page: 'tickets'      },
  customers:   { label: 'Customers',      icon: '🏢', color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0', page: 'customers'    },
  products:    { label: 'Products',       icon: '📦', color: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE', page: 'products'     },
  deployments: { label: 'Deployments',    icon: '🚀', color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A', page: 'deployments'  },
  ideas:       { label: 'Ideas Board',    icon: '💡', color: '#EC4899', bg: '#FDF2F8', border: '#FBCFE8', page: 'features'     },
  kb:          { label: 'Knowledge Base', icon: '📚', color: '#14B8A6', bg: '#F0FDFA', border: '#99F6E4', page: 'knowledgebase' },
};

const STATUS_COLORS = {
  'Open':                { bg: '#EFF6FF', text: '#1D4ED8', bar: '#3B82F6' },
  'Pending':             { bg: '#FFF7ED', text: '#C2410C', bar: '#F97316' },
  'In Investigation':    { bg: '#FEF3C7', text: '#92400E', bar: '#FBBF24' },
  'Pending Engineering': { bg: '#F3E8FF', text: '#7E22CE', bar: '#A855F7' },
  'Waiting on Customer': { bg: '#FCE7F3', text: '#9D174D', bar: '#EC4899' },
  'Pending Release':     { bg: '#ECFDF5', text: '#065F46', bar: '#10B981' },
  'Resolved':            { bg: '#F0FDF4', text: '#166534', bar: '#22C55E' },
  'Closed':              { bg: '#F9FAFB', text: '#6B7280', bar: '#9CA3AF' },
  'Canceled':            { bg: '#FEF2F2', text: '#991B1B', bar: '#EF4444' },
};

const PRIORITY_COLORS = {
  'Low':      { text: '#6B7280', bar: '#9CA3AF' },
  'Medium':   { text: '#D97706', bar: '#FBBF24' },
  'High':     { text: '#EA580C', bar: '#F97316' },
  'Critical': { text: '#DC2626', bar: '#EF4444' },
};

const DEPLOYMENT_STATUS_COLORS = {
  'Planned':     { bg: '#EFF6FF', text: '#1D4ED8' },
  'In Progress': { bg: '#FEF3C7', text: '#92400E' },
  'Completed':   { bg: '#F0FDF4', text: '#166534' },
  'Failed':      { bg: '#FEF2F2', text: '#991B1B' },
  'Rolled Back': { bg: '#F3E8FF', text: '#7E22CE' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  const now = new Date();
  const dt  = new Date(d);
  const diffMs = now - dt;
  const diffH  = diffMs / 36e5;
  if (diffH < 1)  return `${Math.round(diffMs / 60000)}m ago`;
  if (diffH < 24) return `${Math.round(diffH)}h ago`;
  if (diffH < 48) return 'Yesterday';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDateShort(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// ── Micro Components ──────────────────────────────────────────────────────────

function StatusPill({ status, small }) {
  const s = STATUS_COLORS[status] || { bg: '#F3F4F6', text: '#374151' };
  return (
    <span style={{
      display: 'inline-block',
      background: s.bg, color: s.text,
      fontSize: small ? 10 : 11, fontWeight: 600,
      padding: small ? '1px 6px' : '2px 8px', borderRadius: 999,
      whiteSpace: 'nowrap',
    }}>
      {status || '—'}
    </span>
  );
}

function PriorityDot({ priority }) {
  const c = PRIORITY_COLORS[priority] || { text: '#6B7280' };
  return (
    <span style={{ color: c.text, fontWeight: 700, fontSize: 11 }}>{priority}</span>
  );
}

function Trend({ value, suffix = '' }) {
  if (value === undefined || value === null) return null;
  const positive = value >= 0;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600,
      color: positive ? '#DC2626' : '#16A34A',
      display: 'flex', alignItems: 'center', gap: 2,
    }}>
      {positive ? '▲' : '▼'} {Math.abs(value)}{suffix}
    </span>
  );
}

function BarChart({ items, colorKey, max }) {
  const peak = max || Math.max(...items.map((i) => i.n), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((item) => {
        const pct = Math.round((item.n / peak) * 100);
        const c   = colorKey?.[item.label || item.status || item.priority];
        return (
          <div key={item.label || item.status || item.priority} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#6B7280', width: 116, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {item.label || item.status || item.priority}
            </span>
            <div style={{ flex: 1, height: 6, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: c?.bar || '#94A3B8', borderRadius: 3, transition: 'width 0.6s ease' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', minWidth: 22, textAlign: 'right' }}>{item.n}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Widget Shell ──────────────────────────────────────────────────────────────

function Widget({ module: mod, count, loading, onNav, children, span, footer, headerRight, subtitle }) {
  const m = MODULE[mod];
  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      border: '1px solid #E5E7EB',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      gridColumn: span ? `span ${span}` : undefined,
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      transition: 'box-shadow 0.15s',
    }}
      onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.09)'}
      onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'}
    >
      {/* Widget header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        padding: '16px 18px 12px',
        borderBottom: '1px solid #F3F4F6',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: m.bg, border: `1px solid ${m.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0,
          }}>
            {m.icon}
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>{m.label}</div>
            {subtitle && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{subtitle}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {headerRight}
          {count !== undefined && (
            <div style={{
              fontSize: 22, fontWeight: 800, color: m.color, lineHeight: 1,
            }}>
              {loading ? <span style={{ fontSize: 14, color: '#D1D5DB' }}>…</span> : count}
            </div>
          )}
        </div>
      </div>

      {/* Widget body */}
      <div style={{ flex: 1, padding: '14px 18px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ height: 14, borderRadius: 4, background: '#F3F4F6', width: `${70 + i * 8}%` }} />
            ))}
          </div>
        ) : children}
      </div>

      {/* Widget footer */}
      {footer !== false && (
        <div style={{
          padding: '10px 18px',
          borderTop: '1px solid #F9FAFB',
          background: '#FAFAFA',
        }}>
          <button
            onClick={() => onNav(m.page)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, color: m.color,
              display: 'flex', alignItems: 'center', gap: 4, padding: 0,
            }}
          >
            View all {m.label} →
          </button>
        </div>
      )}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon, color, bg, border, sub, onClick, loading, urgent }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        border: `1px solid ${urgent ? '#FECACA' : (border || '#E5E7EB')}`,
        borderRadius: 12,
        padding: '18px 20px',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: urgent ? '0 0 0 2px #FCA5A5' : '0 1px 4px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.15s, transform 0.1s',
        display: 'flex', flexDirection: 'column', gap: 10,
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={(e) => { if (onClick) { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = urgent ? '0 0 0 2px #FCA5A5' : '0 1px 4px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: '12px 12px 0 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </div>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: bg || '#F3F4F6',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
        }}>
          {icon}
        </div>
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color: urgent ? '#DC2626' : '#111827', lineHeight: 1 }}>
        {loading ? <span style={{ fontSize: 16, color: '#E5E7EB' }}>…</span> : value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: '#9CA3AF' }}>{sub}</div>
      )}
    </div>
  );
}

// ── System Health Bar ─────────────────────────────────────────────────────────

function SystemHealth({ critical, loading }) {
  const healthy = !loading && critical === 0;
  const warning = !loading && critical > 0 && critical < 3;
  const alert   = !loading && critical >= 3;
  const color   = healthy ? '#10B981' : warning ? '#F59E0B' : '#EF4444';
  const label   = healthy ? 'All Systems Operational' : warning ? `${critical} Critical Issue${critical > 1 ? 's' : ''}` : `${critical} Critical Alerts`;
  const dot     = healthy ? '●' : warning ? '◉' : '⬤';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: healthy ? 'rgba(16,185,129,0.12)' : alert ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
      border: `1px solid ${healthy ? 'rgba(16,185,129,0.3)' : alert ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
      borderRadius: 8, padding: '5px 14px',
    }}>
      <span style={{ color, fontSize: 10, animation: alert ? 'pulse 1.5s infinite' : 'none' }}>{dot}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: healthy ? '#065F46' : alert ? '#991B1B' : '#92400E' }}>
        {loading ? 'Checking status…' : label}
      </span>
    </div>
  );
}

// ── Tickets Widget Content ────────────────────────────────────────────────────

function TicketsWidgetContent({ stats, recentTickets, onNav }) {
  if (!stats || !recentTickets) return null;

  const byStatus = stats.by_status || [];
  const activeStatuses = byStatus.filter((s) => !['Resolved','Closed','Canceled'].includes(s.status));

  return (
    <div style={{ display: 'flex', gap: 20 }}>
      {/* Left: status bars */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>By Status</div>
        <BarChart
          items={byStatus.map((s) => ({ ...s, label: s.status }))}
          colorKey={Object.fromEntries(Object.entries(STATUS_COLORS).map(([k, v]) => [k, v]))}
        />
      </div>
      {/* Right: recent list */}
      <div style={{ width: 220, flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Recent Open</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {recentTickets.slice(0, 5).map((t) => (
            <div key={t.id} style={{
              padding: '8px 10px', borderRadius: 7,
              background: '#F9FAFB', border: '1px solid #F3F4F6',
              cursor: 'pointer',
            }}
              onClick={() => onNav('open')}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                #{t.id} {t.title}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <StatusPill status={t.status} small />
                <PriorityDot priority={t.priority} />
                <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 'auto' }}>{fmtDate(t.created_at)}</span>
              </div>
            </div>
          ))}
          {recentTickets.length === 0 && (
            <div style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '12px 0' }}>No open tickets 🎉</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Customers Widget Content ──────────────────────────────────────────────────

function CustomersWidgetContent({ customers }) {
  if (!customers) return null;
  // Show all non-archived customers (active=1 is the soft-delete flag)
  const enabled = customers.filter((c) => c.active !== 0);
  const top = [...enabled].slice(0, 5);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {top.map((c) => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: '#ECFDF5', border: '1px solid #A7F3D0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, flexShrink: 0,
          }}>
            {(c.name?.[0] || '?').toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
            {c.lifecycle_status && (
              <div style={{ fontSize: 10.5, color: '#6B7280' }}>{c.lifecycle_status}</div>
            )}
          </div>
          {c.industry && (
            <span style={{ fontSize: 10, color: '#9CA3AF', whiteSpace: 'nowrap' }}>{c.industry}</span>
          )}
        </div>
      ))}
      {enabled.length === 0 && (
        <div style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '12px 0' }}>No customers yet</div>
      )}
    </div>
  );
}

// ── Products Widget Content ───────────────────────────────────────────────────

function ProductsWidgetContent({ products, byProduct }) {
  if (!products) return null;

  const productList = Array.isArray(products) ? products : [];
  const ticketMap   = Object.fromEntries((byProduct || []).map((p) => [p.product, p.n]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {productList.slice(0, 5).map((name, i) => {
        const ticketCount = ticketMap[name] || 0;
        return (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: '#F5F3FF', border: '1px solid #DDD6FE',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, flexShrink: 0,
            }}>
              📦
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
            </div>
            {ticketCount > 0 && (
              <span style={{
                fontSize: 10.5, fontWeight: 700,
                background: '#EFF6FF', color: '#1D4ED8',
                borderRadius: 5, padding: '1px 7px',
              }}>{ticketCount} tickets</span>
            )}
          </div>
        );
      })}
      {productList.length === 0 && (
        <div style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '12px 0' }}>No products configured</div>
      )}
    </div>
  );
}

// ── Deployments Widget Content ────────────────────────────────────────────────

function DeploymentsWidgetContent({ deployments }) {
  if (!deployments) return null;
  const recent = [...deployments]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {recent.map((d) => {
        const sc = DEPLOYMENT_STATUS_COLORS[d.status] || { bg: '#F3F4F6', text: '#374151' };
        return (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: '#FFFBEB', border: '1px solid #FDE68A',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, flexShrink: 0,
            }}>🚀</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {d.product_name || 'Unknown'} {d.version}
              </div>
              <div style={{ fontSize: 10.5, color: '#6B7280' }}>{d.environment} · {fmtDate(d.created_at)}</div>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700,
              background: sc.bg, color: sc.text,
              borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap',
            }}>{d.status}</span>
          </div>
        );
      })}
      {recent.length === 0 && (
        <div style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '12px 0' }}>No deployments yet</div>
      )}
    </div>
  );
}

// ── Ideas Widget Content ──────────────────────────────────────────────────────

function IdeasWidgetContent({ ideas }) {
  if (!ideas) return null;
  const top = [...ideas]
    .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))
    .slice(0, 5);

  const STATUS_MAP = {
    submitted:    { label: 'Submitted',    color: '#6B7280' },
    under_review: { label: 'Under Review', color: '#D97706' },
    planned:      { label: 'Planned',      color: '#7C3AED' },
    in_progress:  { label: 'In Progress',  color: '#2563EB' },
    shipped:      { label: 'Shipped',       color: '#059669' },
    declined:     { label: 'Declined',     color: '#DC2626' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {top.map((idea) => {
        const s = STATUS_MAP[idea.status] || { label: idea.status, color: '#6B7280' };
        return (
          <div key={idea.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 28, borderRadius: 6, flexShrink: 0,
              background: '#FDF2F8', border: '1px solid #FBCFE8',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: '#EC4899',
            }}>
              {idea.vote_count || 0}▲
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {idea.title}
              </div>
              <div style={{ fontSize: 10.5, color: s.color, fontWeight: 600 }}>{s.label}</div>
            </div>
          </div>
        );
      })}
      {top.length === 0 && (
        <div style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '12px 0' }}>No ideas submitted yet</div>
      )}
    </div>
  );
}

// ── KB Widget Content ─────────────────────────────────────────────────────────
// The /api/kb/tree endpoint returns { folders: [...], files: [...], articles: [...] }

function KbWidgetContent({ kbTree }) {
  if (!kbTree) return null;

  // kbTree = { folders: [], files: [], articles: [] }
  const articles  = Array.isArray(kbTree.articles) ? kbTree.articles : [];
  const folders   = Array.isArray(kbTree.folders)  ? kbTree.folders  : [];
  const published = articles.filter((a) => a.status === 'published');
  const recent    = [...articles].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        {[
          { label: 'Articles',  value: articles.length,  color: '#14B8A6', bg: '#F0FDFA' },
          { label: 'Published', value: published.length, color: '#059669', bg: '#ECFDF5' },
          { label: 'Folders',   value: folders.length,   color: '#6B7280', bg: '#F9FAFB' },
        ].map((s) => (
          <div key={s.label} style={{
            flex: 1, padding: '8px 10px', borderRadius: 8,
            background: s.bg, textAlign: 'center',
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Recent articles */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {recent.slice(0, 3).map((a) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13 }}>📄</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: a.status === 'published' ? '#059669' : '#6B7280',
              background: a.status === 'published' ? '#ECFDF5' : '#F3F4F6',
              borderRadius: 4, padding: '1px 6px',
            }}>{a.status === 'published' ? '✓ Live' : 'Draft'}</span>
          </div>
        ))}
        {recent.length === 0 && (
          <div style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '8px 0' }}>No articles yet</div>
        )}
      </div>
    </div>
  );
}

// ── Priority Breakdown ────────────────────────────────────────────────────────

function PriorityBreakdown({ byPriority }) {
  if (!byPriority?.length) return null;
  const ordered = ['Critical', 'High', 'Medium', 'Low'];
  const items = ordered.map((p) => {
    const found = byPriority.find((x) => x.priority === p);
    return { priority: p, n: found?.n || 0, label: p };
  }).filter((i) => i.n > 0);

  return <BarChart items={items} colorKey={PRIORITY_COLORS} />;
}

// ── Quick Actions ─────────────────────────────────────────────────────────────

function QuickActions({ onNav }) {
  const actions = [
    { label: 'All Tickets',     icon: '🎫', page: 'tickets',      color: '#3B82F6', bg: '#EFF6FF' },
    { label: 'Open Tickets',    icon: '📬', page: 'open',         color: '#3B82F6', bg: '#EFF6FF' },
    { label: 'Reports',         icon: '📊', page: 'reports',      color: '#7C3AED', bg: '#F5F3FF' },
    { label: 'Announcements',   icon: '📣', page: 'announcements',color: '#EA580C', bg: '#FFF7ED' },
    { label: 'Deployments',     icon: '🚀', page: 'deployments',  color: '#F59E0B', bg: '#FFFBEB' },
    { label: 'Knowledge Base',  icon: '📚', page: 'knowledgebase',color: '#14B8A6', bg: '#F0FDFA' },
  ];

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {actions.map((a) => (
        <button
          key={a.page}
          onClick={() => onNav(a.page)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 16px', fontSize: 13, fontWeight: 600,
            background: '#fff', color: a.color,
            border: `1.5px solid ${a.bg === '#EFF6FF' ? '#BFDBFE' : a.bg}`,
            borderRadius: 8, cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = a.bg; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.transform = 'none'; }}
        >
          <span style={{ fontSize: 15 }}>{a.icon}</span>
          {a.label}
        </button>
      ))}
    </div>
  );
}

// ── Main OperationsCenterPage ─────────────────────────────────────────────────

export default function OperationsCenterPage({ onNav }) {
  const user     = useUser();
  const { products: PRODUCTS } = useProducts();
  const clock    = useClock();

  const [stats,       setStats]       = useState(null);
  const [tickets,     setTickets]     = useState(null);
  const [customers,   setCustomers]   = useState(null);
  const [deployments, setDeployments] = useState(null);
  const [ideas,       setIdeas]       = useState(null);
  const [kbTree,      setKbTree]      = useState(null);
  const [settings,    setSettings]    = useState({ company_name: 'Helyx' });
  const [loading,     setLoading]     = useState(true);

  const loadAll = useCallback(async () => {
    try {
      const [
        statsData, ticketsData, customersData,
        deploymentsData, ideasData, kbData, settingsData,
      ] = await Promise.allSettled([
        api.getStats(),
        api.getTickets(),
        api.getCustomers(),
        api.getDeployments(),
        api.getFeatureRequests(),
        api.getKbTree(),
        api.getSettings(),
      ]);

      if (statsData.status       === 'fulfilled') setStats(statsData.value);
      if (ticketsData.status     === 'fulfilled') setTickets(ticketsData.value);
      if (customersData.status   === 'fulfilled') setCustomers(customersData.value);
      if (deploymentsData.status === 'fulfilled') setDeployments(deploymentsData.value);
      if (ideasData.status       === 'fulfilled') setIdeas(ideasData.value);
      if (kbData.status          === 'fulfilled') setKbTree(kbData.value);
      if (settingsData.status    === 'fulfilled') setSettings((prev) => ({ ...prev, ...settingsData.value }));
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, 60_000); // refresh every minute
    return () => clearInterval(t);
  }, [loadAll]);

  // Derived values
  const openTickets       = tickets?.filter((t) => t.status === 'Open') || [];
  const criticalCount     = stats?.critical || 0;
  // c.active is the soft-delete flag (not archived); lifecycle_status is the business status
  const enabledCustomers  = customers?.filter((c) => c.active !== 0) || [];
  const activeCustomers   = customers?.filter((c) => c.lifecycle_status === 'Active') || [];
  const pendingCount      = stats?.pending || 0;

  const now = clock;
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minHeight: '100%' }}>

      {/* ── Hero header ───────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 60%, #0F3460 100%)',
        borderRadius: 14,
        padding: '28px 32px',
        marginBottom: 22,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative grid */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(59,130,246,0.08) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          pointerEvents: 'none',
        }} />
        {/* Glow accents */}
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -60, left: 100, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#F1F5F9', margin: 0, letterSpacing: '-0.5px', lineHeight: 1.2 }}>
              Helyx Operations Center
            </h1>
            <div style={{ fontSize: 14, color: '#64748B', marginTop: 6 }}>
              {greeting}, <span style={{ color: '#93C5FD', fontWeight: 600 }}>{user?.name?.split(' ')[0] || 'there'}</span>
            </div>
          </div>

          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
            <SystemHealth critical={criticalCount} loading={loading} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#F1F5F9', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>
                {timeStr}
              </div>
              <div style={{ fontSize: 11, color: '#64748B', textAlign: 'right' }}>{dateStr}</div>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ position: 'relative', marginTop: 22 }}>
          <QuickActions onNav={onNav} />
        </div>
      </div>

      {/* ── KPI cards row ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        <KpiCard
          label="Total Tickets"
          value={stats?.total ?? '—'}
          icon="🎫"
          color="#3B82F6"
          bg="#EFF6FF"
          border="#BFDBFE"
          sub={`${stats?.resolved ?? 0} resolved`}
          onClick={() => onNav('tickets')}
          loading={loading}
        />
        <KpiCard
          label="Open Tickets"
          value={stats?.open ?? '—'}
          icon="📬"
          color="#F97316"
          bg="#FFF7ED"
          border="#FED7AA"
          sub={`${pendingCount} pending action`}
          onClick={() => onNav('open')}
          loading={loading}
        />
        <KpiCard
          label="Critical Issues"
          value={criticalCount}
          icon="🔴"
          color="#EF4444"
          bg="#FEF2F2"
          border="#FECACA"
          sub="active unresolved"
          onClick={() => onNav('open')}
          loading={loading}
          urgent={criticalCount > 0}
        />
        <KpiCard
          label="Active Customers"
          value={loading ? '—' : activeCustomers.length}
          icon="🏢"
          color="#10B981"
          bg="#ECFDF5"
          border="#A7F3D0"
          sub={`of ${enabledCustomers.length} total accounts`}
          onClick={() => onNav('customers')}
          loading={loading}
        />
      </div>

      {/* ── Main widget grid ──────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Tickets — wide, 2 columns */}
        <WidgetErrorBoundary>
          <Widget
            module="tickets"
            count={stats?.total}
            loading={loading}
            onNav={onNav}
            span={2}
            subtitle={`${openTickets.length} open · ${criticalCount} critical`}
          >
            <TicketsWidgetContent stats={stats} recentTickets={openTickets} onNav={onNav} />
          </Widget>
        </WidgetErrorBoundary>

        {/* Customers */}
        <WidgetErrorBoundary>
          <Widget
            module="customers"
            count={loading ? undefined : enabledCustomers.length}
            loading={loading}
            onNav={onNav}
            subtitle={`${activeCustomers.length} active · ${enabledCustomers.length} total`}
          >
            <CustomersWidgetContent customers={customers} />
          </Widget>
        </WidgetErrorBoundary>

        {/* Products */}
        <WidgetErrorBoundary>
          <Widget
            module="products"
            count={loading ? undefined : (Array.isArray(PRODUCTS) ? PRODUCTS.length : 0)}
            loading={loading}
            onNav={onNav}
            subtitle="managed product lines"
          >
            <ProductsWidgetContent products={PRODUCTS} byProduct={stats?.by_product} />
          </Widget>
        </WidgetErrorBoundary>

        {/* Deployments */}
        <WidgetErrorBoundary>
          <Widget
            module="deployments"
            count={loading ? undefined : (deployments?.length ?? 0)}
            loading={loading}
            onNav={onNav}
            subtitle="total deployments"
          >
            <DeploymentsWidgetContent deployments={deployments} />
          </Widget>
        </WidgetErrorBoundary>

        {/* Ideas Board */}
        <WidgetErrorBoundary>
          <Widget
            module="ideas"
            count={loading ? undefined : (ideas?.length ?? 0)}
            loading={loading}
            onNav={onNav}
            subtitle="community ideas"
          >
            <IdeasWidgetContent ideas={ideas} />
          </Widget>
        </WidgetErrorBoundary>

      </div>

      {/* ── Bottom row: Priority breakdown + KB ──────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 4 }}>

        {/* Priority breakdown */}
        <WidgetErrorBoundary>
          <div style={{
            background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB',
            padding: '18px 20px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111827', marginBottom: 14 }}>
              🔥 Tickets by Priority
            </div>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[80, 60, 90, 40].map((w, i) => (
                  <div key={i} style={{ height: 12, borderRadius: 4, background: '#F3F4F6', width: `${w}%` }} />
                ))}
              </div>
            ) : (
              <PriorityBreakdown byPriority={stats?.by_priority} />
            )}
          </div>
        </WidgetErrorBoundary>

        {/* Knowledge Base */}
        <WidgetErrorBoundary>
          <Widget
            module="kb"
            count={undefined}
            loading={loading}
            onNav={onNav}
            subtitle="articles & documentation"
            footer
          >
            <KbWidgetContent kbTree={kbTree} />
          </Widget>
        </WidgetErrorBoundary>

      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
