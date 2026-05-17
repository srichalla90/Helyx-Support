import { useState, useEffect, useCallback, useRef } from 'react';
import { api, STATUSES, PRIORITIES, TICKET_TYPES } from '../api';
import { useProducts } from '../context/ProductsContext';
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
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', cursor: 'pointer', fontSize: 13,
            color: '#6B7280', borderBottom: '1px solid #F3F4F6', marginBottom: 2,
          }}>
            <input
              type="checkbox"
              checked={selected.length === 0}
              onChange={() => onChange([])}
              style={{ accentColor: '#1E293B' }}
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
                  style={{ accentColor: '#1E293B' }}
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

// ── Bulk Action Bar ───────────────────────────────────────────────────────────
function BulkActionBar({ selectedCount, onClear, onBulkAction, agents, groups }) {
  const [bulkStatus,   setBulkStatus]   = useState('');
  const [bulkPriority, setBulkPriority] = useState('');
  const [bulkAssign,   setBulkAssign]   = useState('');
  const [bulkGroup,    setBulkGroup]    = useState('');
  const [applying,     setApplying]     = useState(false);

  async function apply() {
    if (!bulkStatus && !bulkPriority && !bulkAssign && !bulkGroup) return;
    setApplying(true);
    const updates = {};
    if (bulkStatus)   updates.status = bulkStatus;
    if (bulkPriority) updates.priority = bulkPriority;
    if (bulkAssign)   updates.assigned_to = bulkAssign === '__unassign__' ? null : Number(bulkAssign);
    if (bulkGroup)    updates.group_id    = bulkGroup    === '__unassign__' ? null : Number(bulkGroup);
    await onBulkAction('update', updates);
    setBulkStatus(''); setBulkPriority(''); setBulkAssign(''); setBulkGroup('');
    setApplying(false);
  }

  const sel = { fontSize: 13, padding: '5px 10px', border: '1px solid #D1D5DB', borderRadius: 7, background: '#fff', cursor: 'pointer', color: '#374151', outline: 'none' };

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: '#1E293B', color: '#fff', borderRadius: 12,
      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.25)', zIndex: 1000, flexWrap: 'wrap',
      maxWidth: '90vw',
    }}>
      <span style={{ fontWeight: 700, fontSize: 13, paddingRight: 8, borderRight: '1px solid rgba(255,255,255,0.2)' }}>
        {selectedCount} selected
      </span>
      <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} style={sel}>
        <option value="">Set status…</option>
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={bulkPriority} onChange={(e) => setBulkPriority(e.target.value)} style={sel}>
        <option value="">Set priority…</option>
        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select value={bulkAssign} onChange={(e) => setBulkAssign(e.target.value)} style={sel}>
        <option value="">Assign to…</option>
        <option value="__unassign__">— Unassigned —</option>
        {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <select value={bulkGroup} onChange={(e) => setBulkGroup(e.target.value)} style={sel}>
        <option value="">Set group…</option>
        <option value="__unassign__">— Unassigned —</option>
        {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
      <button
        onClick={apply}
        disabled={applying || (!bulkStatus && !bulkPriority && !bulkAssign && !bulkGroup)}
        style={{ padding: '6px 16px', fontSize: 13, fontWeight: 700, background: '#1E293B', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', opacity: applying ? 0.7 : 1 }}
      >
        {applying ? 'Applying…' : 'Apply'}
      </button>
      <button
        onClick={() => onBulkAction('delete')}
        style={{ padding: '6px 12px', fontSize: 13, fontWeight: 700, background: '#DC2626', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' }}
      >
        🗑 Delete
      </button>
      <button
        onClick={onClear}
        style={{ padding: '6px 12px', fontSize: 13, background: 'none', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 7, cursor: 'pointer' }}
      >
        Cancel
      </button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const PENDING_STATUSES = new Set([
  'Pending', 'In Investigation', 'Pending Engineering',
  'Waiting on Customer', 'Pending Release',
]);

export default function TicketList({ onSelect, filterStatus }) {
  const { products: PRODUCTS } = useProducts();
  const [allTickets,  setAllTickets]  = useState([]);
  const [groups,      setGroups]      = useState([]);
  const [agents,      setAgents]      = useState([]);
  const [stats,       setStats]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [showNew,     setShowNew]     = useState(false);
  const [filters,     setFilters]     = useState(FILTER_DEFAULTS);
  const [selected,    setSelected]    = useState(new Set()); // selected ticket IDs
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const toast = useToast();

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.search) params.search = filters.search;
      const data = await api.getTickets(params);
      setAllTickets(data);
      setSelected(new Set()); // clear selection on reload
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
    api.getUsers().then((u) => setAgents(u.filter((usr) => usr.role !== 'customer'))).catch(() => {});
  }, []);

  useEffect(() => {
    setFilters(FILTER_DEFAULTS);
    setSelected(new Set());
  }, [filterStatus]);

  const tickets = allTickets.filter((t) => {
    if (filterStatus === 'open')     { if (t.status !== 'Open') return false; }
    if (filterStatus === 'pending')  { if (!PENDING_STATUSES.has(t.status)) return false; }
    if (filterStatus === 'resolved') { if (t.status !== 'Resolved' && t.status !== 'Closed') return false; }
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
  const showStatusFilter = filterStatus === 'tickets';

  // ── Bulk selection ────────────────────────────────────────────────────────
  const visibleIds = tickets.map((t) => t.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = visibleIds.some((id) => selected.has(id));

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => { const next = new Set(prev); visibleIds.forEach((id) => next.delete(id)); return next; });
    } else {
      setSelected((prev) => { const next = new Set(prev); visibleIds.forEach((id) => next.add(id)); return next; });
    }
  }

  async function handleBulkAction(action, updates) {
    const ids = [...selected];
    if (!ids.length) return;

    if (action === 'delete') {
      setBulkDeleteConfirm(true);
      return;
    }

    if (action === 'update') {
      try {
        await Promise.all(ids.map((id) => api.updateTicket(id, { ...updates, actor: 'Bulk Action' })));
        toast(`Updated ${ids.length} ticket(s)`, 'success');
        loadTickets();
      } catch (e) { toast(e.message, 'error'); }
    }
  }

  async function doBulkDelete() {
    setBulkDeleteConfirm(false);
    const ids = [...selected];
    try {
      await Promise.all(ids.map((id) => api.deleteTicket(id)));
      toast(`Deleted ${ids.length} ticket(s)`, 'success');
      loadTickets();
    } catch (e) { toast(e.message, 'error'); }
  }

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
                <th style={{ width: 36, paddingRight: 0 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={toggleAll}
                    style={{ accentColor: '#1E293B', cursor: 'pointer' }}
                  />
                </th>
                <th style={{ width: 60 }}>#</th>
                <th>Subject</th>
                <th>Type</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Product</th>
                <th>Assigned To</th>
                <th>SLA</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const isSelected = selected.has(t.id);
                return (
                  <tr
                    key={t.id}
                    onClick={(e) => {
                      // If clicking checkbox cell, don't navigate
                      if (e.target.type === 'checkbox') return;
                      onSelect(t.id);
                    }}
                    style={{ background: isSelected ? '#EFF6FF' : undefined }}
                  >
                    <td style={{ paddingRight: 0 }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(t.id)}
                        style={{ accentColor: '#1E293B', cursor: 'pointer' }}
                      />
                    </td>
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
                    <td style={{ fontSize: 12, color: '#6B7280' }}>{t.assigned_user_name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {t.sla_status === 'breached' ? (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: '#FEE2E2', color: '#B91C1C' }}>
                          ⚠ Breached
                        </span>
                      ) : t.sla_status === 'met' ? (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: '#F0FDF4', color: '#166534' }}>
                          ✓ Met
                        </span>
                      ) : t.sla_status === 'ok' ? (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: '#FFF7ED', color: '#C2410C' }}>
                          {t.sla_remaining_hours < 1
                            ? `${Math.round(t.sla_remaining_hours * 60)}m left`
                            : `${Math.round(t.sla_remaining_hours)}h left`}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#D1D5DB' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>
                      {fmtDate(t.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk action floating bar */}
      {selected.size > 0 && (
        <BulkActionBar
          selectedCount={selected.size}
          onClear={() => setSelected(new Set())}
          onBulkAction={handleBulkAction}
          agents={agents}
          groups={groups}
        />
      )}

      {bulkDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 10 }}>Delete Tickets?</div>
            <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 24 }}>
              Delete {selected.size} selected ticket(s)? This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setBulkDeleteConfirm(false)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 7, cursor: 'pointer' }}>Cancel</button>
              <button onClick={doBulkDelete} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#DC2626', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
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
