import { useState, useEffect, useCallback, useRef } from 'react';
import { api, STATUSES, PRIORITIES, PRODUCTS, TICKET_TYPES } from '../api';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge';
import CreateTicketModal from '../components/CreateTicketModal';
import { useToast } from '../components/Toast';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const FILTER_DEFAULTS = {
  statuses:   [],
  priorities: [],
  products:   [],
  types:      [],
  group_ids:  [],
  search:     '',
};

// ── Multi-select dropdown ─────────────────────────────────────────────────────

function MultiSelectDropdown({ placeholder, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function toggle(val) {
    onChange(
      selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val]
    );
  }

  // Display label
  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
      ? (options.find((o) => (o.value ?? o) === selected[0])?.label ?? selected[0])
      : `${selected.length} selected`;

  const hasSelection = selected.length > 0;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="filter-select"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          cursor: 'pointer', userSelect: 'none',
          background: hasSelection ? '#EFF6FF' : undefined,
          borderColor: hasSelection ? '#BFDBFE' : undefined,
          color: hasSelection ? '#1D4ED8' : undefined,
          fontWeight: hasSelection ? 600 : undefined,
          paddingRight: 10,
        }}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        {hasSelection && (
          <span
            onClick={(e) => { e.stopPropagation(); onChange([]); }}
            title="Clear"
            style={{ fontSize: 11, opacity: 0.6, lineHeight: 1, cursor: 'pointer', padding: '0 2px' }}
          >
            ✕
          </span>
        )}
        <span style={{ fontSize: 10, opacity: 0.5, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
          background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
          minWidth: 180, maxHeight: 280, overflowY: 'auto',
          padding: '6px 0',
        }}>
          {/* All / clear row */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', cursor: 'pointer', fontSize: 13,
            color: '#6B7280', borderBottom: '1px solid #F3F4F6', marginBottom: 2,
          }}>
            <input
              type="checkbox"
              checked={selected.length === 0}
              onChange={() => onChange([])}
              style={{ accentColor: '#2563EB' }}
            />
            <span style={{ fontStyle: 'italic' }}>All</span>
          </label>

          {options.map((opt) => {
            const val   = opt.value ?? opt;
            const lbl   = opt.label ?? opt;
            const checked = selected.includes(val);
            return (
              <label key={val} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 14px', cursor: 'pointer', fontSize: 13,
                color: '#374151',
                background: checked ? '#EFF6FF' : undefined,
              }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(val)}
                  style={{ accentColor: '#2563EB' }}
                />
                {lbl}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const PENDING_STATUSES = new Set([
  'Pending', 'In Investigation', 'Pending Engineering',
  'Waiting on Customer', 'Pending Release',
]);

export default function TicketList({ onSelect, filterStatus }) {
  const [allTickets, setAllTickets] = useState([]);
  const [groups,     setGroups]     = useState([]);
  const [stats,      setStats]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [showNew,    setShowNew]    = useState(false);
  const [filters,    setFilters]    = useState(FILTER_DEFAULTS);
  const toast = useToast();

  // ── Fetch all tickets (search is the only server-side param) ────────────────
  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.search) params.search = filters.search;
      const data = await api.getTickets(params);
      setAllTickets(data);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [filters.search]);

  useEffect(() => { loadTickets(); }, [loadTickets]);
  useEffect(() => {
    api.getStats().then(setStats).catch(() => {});
    api.getGroups().then(setGroups).catch(() => {});
  }, []);

  // Reset filters when switching sidebar views
  useEffect(() => {
    setFilters(FILTER_DEFAULTS);
  }, [filterStatus]);

  // ── Client-side filter + filterStatus preset ─────────────────────────────
  const tickets = allTickets.filter((t) => {
    // Sidebar preset
    if (filterStatus === 'open')     { if (t.status !== 'Open') return false; }
    if (filterStatus === 'pending')  { if (!PENDING_STATUSES.has(t.status)) return false; }
    if (filterStatus === 'resolved') { if (t.status !== 'Resolved' && t.status !== 'Closed') return false; }

    // Multi-select filters
    if (filters.statuses.length   && !filters.statuses.includes(t.status))              return false;
    if (filters.priorities.length && !filters.priorities.includes(t.priority))          return false;
    if (filters.products.length   && !filters.products.includes(t.product))             return false;
    if (filters.types.length      && !filters.types.includes(t.type))                   return false;
    if (filters.group_ids.length  && !filters.group_ids.includes(String(t.group_id)))   return false;

    return true;
  });

  function setFilter(k) {
    return (v) => setFilters((f) => ({ ...f, [k]: v }));
  }

  const activeFilterCount =
    filters.statuses.length + filters.priorities.length + filters.products.length +
    filters.types.length + filters.group_ids.length + (filters.search ? 1 : 0);

  function clearFilters() { setFilters(FILTER_DEFAULTS); }

  function headingFor() {
    if (filterStatus === 'open')     return 'Open Tickets';
    if (filterStatus === 'pending')  return 'Pending Tickets';
    if (filterStatus === 'resolved') return 'Resolved & Closed';
    return 'All Tickets';
  }

  const groupOptions = groups.map((g) => ({ value: String(g.id), label: g.name }));

  // Only show the Status multi-select on views that aren't already preset to a status
  const showStatusFilter = filterStatus === 'tickets';

  return (
    <div>
      {/* Stats */}
      {stats && filterStatus === 'tickets' && (
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">Total</div>
            <div className="stat-value">{stats.total}</div>
          </div>
          <div className="stat-card open">
            <div className="stat-label">Open</div>
            <div className="stat-value">{stats.open}</div>
          </div>
          <div className="stat-card pending">
            <div className="stat-label">Pending</div>
            <div className="stat-value">{stats.pending}</div>
          </div>
          <div className="stat-card resolved">
            <div className="stat-label">Resolved</div>
            <div className="stat-value">{stats.resolved}</div>
          </div>
          <div className="stat-card critical">
            <div className="stat-label">Critical</div>
            <div className="stat-value">{stats.critical}</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div>
          <h2>{headingFor()}</h2>
          <p>{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}{loading ? ' (loading…)' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          + New Ticket
        </button>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <input
          className="filter-select"
          style={{ width: 200 }}
          placeholder="🔍  Search tickets…"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />

        {showStatusFilter && (
          <MultiSelectDropdown
            placeholder="All Statuses"
            options={STATUSES}
            selected={filters.statuses}
            onChange={setFilter('statuses')}
          />
        )}

        <MultiSelectDropdown
          placeholder="All Priorities"
          options={PRIORITIES}
          selected={filters.priorities}
          onChange={setFilter('priorities')}
        />

        <MultiSelectDropdown
          placeholder="All Products"
          options={PRODUCTS}
          selected={filters.products}
          onChange={setFilter('products')}
        />

        <MultiSelectDropdown
          placeholder="All Types"
          options={TICKET_TYPES}
          selected={filters.types}
          onChange={setFilter('types')}
        />

        <MultiSelectDropdown
          placeholder="All Groups"
          options={groupOptions}
          selected={filters.group_ids}
          onChange={setFilter('group_ids')}
        />

        {activeFilterCount > 0 && (
          <button className="clear-btn" onClick={clearFilters}>
            Clear {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading"><div className="spinner" /> Loading tickets…</div>
      ) : tickets.length === 0 ? (
        <div className="ticket-table-wrap">
          <div className="empty-state">
            <div className="empty-icon">🎫</div>
            <h3>No tickets found</h3>
            <p>Try adjusting your filters or create a new ticket.</p>
          </div>
        </div>
      ) : (
        <div className="ticket-table-wrap">
          <table className="ticket-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>#</th>
                <th>Subject</th>
                <th>Type</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Product</th>
                <th>Group</th>
                <th>Source</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} onClick={() => onSelect(t.id)}>
                  <td style={{ color: '#9CA3AF', fontSize: 12 }}>#{t.id}</td>
                  <td>
                    <div className="ticket-title-cell">
                      <div className="ticket-title">{t.title}</div>
                      {t.requester_email && (
                        <div className="ticket-requester">{t.requester_email}</div>
                      )}
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: '#6B7280' }}>{t.type}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td><PriorityBadge priority={t.priority} /></td>
                  <td style={{ fontSize: 12, color: '#6B7280' }}>{t.product || '—'}</td>
                  <td style={{ fontSize: 12, color: '#6B7280' }}>{t.group_name || '—'}</td>
                  <td>
                    <span className={`source-badge ${t.source}`}>{t.source}</span>
                  </td>
                  <td style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>
                    {fmtDate(t.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <CreateTicketModal
          onClose={() => setShowNew(false)}
          onCreated={() => { toast('Ticket created!', 'success'); loadTickets(); }}
        />
      )}
    </div>
  );
}
