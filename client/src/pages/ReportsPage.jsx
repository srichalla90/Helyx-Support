import { useState, useEffect, useRef } from 'react';
import { useToast } from '../components/Toast';
import { api, STATUSES, PRIORITIES, TICKET_TYPES, PRODUCTS } from '../api';

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

// All available columns in display order
const ALL_COLUMNS = [
  { key: 'id',              label: 'Ticket #',       fmt: (v) => `#${v}`,          required: true  },
  { key: 'title',           label: 'Title',           fmt: (v) => v || '—',         required: true  },
  { key: 'status',          label: 'Status',          fmt: (v) => v || '—',         required: false },
  { key: 'priority',        label: 'Priority',        fmt: (v) => v || '—',         required: false },
  { key: 'type',            label: 'Type',            fmt: (v) => v || '—',         required: false },
  { key: 'product',         label: 'Product',         fmt: (v) => v || '—',         required: false },
  { key: 'customer_name',   label: 'Customer',        fmt: (v) => v || '—',         required: false },
  { key: 'group_name',      label: 'Group',           fmt: (v) => v || '—',         required: false },
  { key: 'requester_email', label: 'Requester Email', fmt: (v) => v || '—',         required: false },
  { key: 'created_at',      label: 'Created',         fmt: fmtDate,                 required: false },
  { key: 'updated_at',      label: 'Last Updated',    fmt: fmtDate,                 required: false },
];

const DEFAULT_COLUMNS = ['id', 'title', 'status', 'priority', 'customer_name', 'created_at'];

// ── Collapsible filter dropdown ───────────────────────────────────────────────
// multi=true  → array selected, checkboxes
// multi=false → single string selected, radio-style (click selects + closes)

function FilterDropdown({ label, options, selected, onChange, multi = true }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Derived display label
  const hasSelection = multi ? selected.length > 0 : !!selected;
  const displayText = !hasSelection
    ? <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>All</span>
    : multi && selected.length > 1
      ? <span style={{ color: '#1D4ED8', fontWeight: 600 }}>{selected.length} selected</span>
      : (() => {
          const val  = multi ? selected[0] : selected;
          const lbl  = options.find((o) => (o.value ?? o) === val);
          return <span style={{ color: '#1D4ED8', fontWeight: 600 }}>{lbl ? (lbl.label ?? lbl) : val}</span>;
        })();

  function toggleMulti(val) {
    onChange(selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val]);
  }

  function selectSingle(val) {
    onChange(selected === val ? '' : val);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ marginBottom: 6, position: 'relative' }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 0,
          padding: '7px 10px', cursor: 'pointer', textAlign: 'left',
          background: hasSelection ? '#EFF6FF' : '#FAFAFA',
          border: `1px solid ${hasSelection ? '#BFDBFE' : '#E5E7EB'}`,
          borderRadius: open ? '7px 7px 0 0' : 7,
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        {/* Label */}
        <span style={{
          fontSize: 11, fontWeight: 700, color: hasSelection ? '#1E40AF' : '#6B7280',
          textTransform: 'uppercase', letterSpacing: '0.5px',
          minWidth: 60, marginRight: 6, flexShrink: 0,
        }}>
          {label}
        </span>

        {/* Value */}
        <span style={{ flex: 1, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayText}
        </span>

        {/* Clear × */}
        {hasSelection && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onChange(multi ? [] : ''); }}
            style={{ fontSize: 11, color: '#93C5FD', marginRight: 6, lineHeight: 1, cursor: 'pointer', padding: '0 2px' }}
            title="Clear"
          >✕</span>
        )}

        {/* Caret */}
        <svg
          width="10" height="10" viewBox="0 0 10 10"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.45 }}
        >
          <path d="M1 3 L5 7 L9 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
          background: '#fff',
          border: '1px solid #BFDBFE', borderTop: 'none',
          borderRadius: '0 0 7px 7px',
          boxShadow: '0 6px 18px rgba(0,0,0,0.09)',
          maxHeight: 224, overflowY: 'auto',
        }}>
          {/* "All" row */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 12px', cursor: 'pointer', fontSize: 12.5,
            color: '#6B7280', borderBottom: '1px solid #F3F4F6',
            background: !hasSelection ? '#F0F9FF' : 'transparent',
          }}>
            <input
              type="checkbox"
              checked={!hasSelection}
              onChange={() => onChange(multi ? [] : '')}
              style={{ accentColor: '#1E293B' }}
            />
            <span style={{ fontStyle: 'italic' }}>All</span>
          </label>

          {options.map((opt) => {
            const val     = opt.value ?? opt;
            const lbl     = opt.label ?? opt;
            const checked = multi ? selected.includes(val) : selected === val;
            return (
              <label
                key={val}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 12px', cursor: 'pointer', fontSize: 12.5,
                  color: '#374151',
                  background: checked ? '#EFF6FF' : 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { if (!checked) e.currentTarget.style.background = '#F9FAFB'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = checked ? '#EFF6FF' : 'transparent'; }}
              >
                <input
                  type={multi ? 'checkbox' : 'radio'}
                  checked={checked}
                  onChange={() => multi ? toggleMulti(val) : selectSingle(val)}
                  style={{ accentColor: '#1E293B' }}
                />
                <span style={{ fontWeight: checked ? 600 : 400, color: checked ? '#1D4ED8' : '#374151' }}>
                  {lbl}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Export helpers ────────────────────────────────────────────────────────────

function exportCSV(rows, activeCols) {
  const header = activeCols.map((c) => c.label).join(',');
  const lines = rows.map((row) =>
    activeCols.map((c) => {
      const raw = row[c.key] != null ? String(row[c.key]) : '';
      return `"${raw.replace(/"/g, '""')}"`;
    }).join(',')
  );
  const csv = [header, ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `helyx-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportPDF(rows, activeCols, filterSummary) {
  const tableRows = rows.map((row) =>
    `<tr>${activeCols.map((c) => `<td>${c.fmt ? c.fmt(row[c.key]) : (row[c.key] ?? '—')}</td>`).join('')}</tr>`
  ).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Helyx Support Report</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; font-size: 12px; padding: 24px; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .meta { font-size: 11px; color: #6B7280; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #1E293B; color: #fff; padding: 7px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 7px 10px; border-bottom: 1px solid #E5E7EB; vertical-align: top; }
    tr:nth-child(even) td { background: #F9FAFB; }
    @media print { @page { margin: 0.75in; } }
  </style>
</head>
<body>
  <h1>Helyx Support — Ticket Report</h1>
  <div class="meta">Generated ${fmtDateTime(new Date().toISOString())} · ${rows.length} ticket${rows.length !== 1 ? 's' : ''}${filterSummary ? ' · Filters: ' + filterSummary : ''}</div>
  <table>
    <thead><tr>${activeCols.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `helyx-report-${new Date().toISOString().slice(0, 10)}.html`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Main ReportsPage ──────────────────────────────────────────────────────────

export default function ReportsPage() {
  const toast = useToast();
  const [customers,   setCustomers]   = useState([]);
  const [groups,      setGroups]      = useState([]);
  const [results,     setResults]     = useState(null); // null = not yet generated
  const [loading,     setLoading]     = useState(false);

  // Filters
  const [selStatuses,  setSelStatuses]  = useState([]);
  const [selPriorities,setSelPriorities]= useState([]);
  const [selTypes,     setSelTypes]     = useState([]);
  const [selProducts,  setSelProducts]  = useState([]);
  const [selCustomer,  setSelCustomer]  = useState('');
  const [selGroup,     setSelGroup]     = useState('');

  // Columns
  const [activeColKeys, setActiveColKeys] = useState(DEFAULT_COLUMNS);

  useEffect(() => {
    Promise.all([api.getCustomers(), api.getGroups()])
      .then(([c, g]) => {
        setCustomers(c.filter((x) => x.active !== 0));
        setGroups(g.filter((x) => x.active !== 0));
      })
      .catch(() => {});
  }, []);

  function toggleColumn(key) {
    const col = ALL_COLUMNS.find((c) => c.key === key);
    if (col?.required) return; // can't deselect required cols
    setActiveColKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function generate() {
    setLoading(true);
    try {
      const all = await api.getTickets();

      const filtered = all.filter((t) => {
        if (selStatuses.length   && !selStatuses.includes(t.status))        return false;
        if (selPriorities.length && !selPriorities.includes(t.priority))    return false;
        if (selTypes.length      && !selTypes.includes(t.type))             return false;
        if (selProducts.length   && !selProducts.includes(t.product))       return false;
        if (selCustomer          && String(t.customer_id) !== selCustomer)  return false;
        if (selGroup             && String(t.group_id)    !== selGroup)      return false;
        return true;
      });

      setResults(filtered);
    } catch (e) {
      toast(e.message || 'Failed to load tickets', 'error');
    } finally {
      setLoading(false);
    }
  }

  const activeCols = ALL_COLUMNS.filter((c) => activeColKeys.includes(c.key));

  function filterSummary() {
    const parts = [];
    if (selStatuses.length)   parts.push(selStatuses.join(', '));
    if (selPriorities.length) parts.push(selPriorities.join(', '));
    if (selTypes.length)      parts.push(selTypes.join(', '));
    if (selProducts.length)   parts.push(selProducts.join(', '));
    if (selCustomer) {
      const c = customers.find((x) => String(x.id) === selCustomer);
      if (c) parts.push(c.name);
    }
    if (selGroup) {
      const g = groups.find((x) => String(x.id) === selGroup);
      if (g) parts.push(g.name);
    }
    return parts.join(' · ') || 'All tickets';
  }

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', minHeight: '100%' }}>

      {/* ── Left: config panel ─────────────────────────────────────────────── */}
      <div style={{
        width: 224, flexShrink: 0,
        background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB',
        padding: '20px 16px',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 20 }}>Configure Report</div>

        {/* Filters */}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 12 }}>
          Filters
        </div>

        <FilterDropdown label="Status"   options={STATUSES}     selected={selStatuses}    onChange={setSelStatuses} />
        <FilterDropdown label="Priority" options={PRIORITIES}  selected={selPriorities}  onChange={setSelPriorities} />
        <FilterDropdown label="Type"     options={TICKET_TYPES} selected={selTypes}      onChange={setSelTypes} />
        <FilterDropdown label="Product"  options={PRODUCTS}    selected={selProducts}    onChange={setSelProducts} />

        <FilterDropdown
          label="Customer"
          multi={false}
          options={customers.map((c) => ({ value: String(c.id), label: c.name }))}
          selected={selCustomer}
          onChange={setSelCustomer}
        />

        <div style={{ marginBottom: 8 }}>
          <FilterDropdown
            label="Group"
            multi={false}
            options={groups.map((g) => ({ value: String(g.id), label: g.name }))}
            selected={selGroup}
            onChange={setSelGroup}
          />
        </div>

        {/* Column picker */}
        <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 12 }}>
            Columns
          </div>
          {ALL_COLUMNS.map((col) => (
            <label key={col.key} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 12.5, color: col.required ? '#9CA3AF' : '#374151',
              marginBottom: 6, cursor: col.required ? 'default' : 'pointer',
            }}>
              <input
                type="checkbox"
                checked={activeColKeys.includes(col.key)}
                onChange={() => toggleColumn(col.key)}
                disabled={col.required}
                style={{ accentColor: '#1E293B' }}
              />
              {col.label}
              {col.required && <span style={{ fontSize: 10, color: '#D1D5DB' }}>always</span>}
            </label>
          ))}
        </div>

        <button
          onClick={generate}
          disabled={loading}
          style={{
            width: '100%', padding: '9px 0',
            background: '#1E293B', color: '#fff',
            border: 'none', borderRadius: 7, fontWeight: 700,
            fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Loading…' : results === null ? 'Generate Report' : 'Refresh Report'}
        </button>
      </div>

      {/* ── Right: results ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Results header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            {results !== null && (
              <>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#111827' }}>
                  {results.length} ticket{results.length !== 1 ? 's' : ''}
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{filterSummary()}</div>
              </>
            )}
          </div>

          {results !== null && results.length > 0 && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => exportCSV(results, activeCols)}
                style={{
                  padding: '7px 16px', fontSize: 13, fontWeight: 700,
                  background: '#1E293B', color: '#fff',
                  border: 'none', borderRadius: 7, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                ⬇ Export CSV
              </button>
              <button
                onClick={() => exportPDF(results, activeCols, filterSummary())}
                style={{
                  padding: '7px 16px', fontSize: 13, fontWeight: 700,
                  background: '#1E293B', color: '#fff',
                  border: 'none', borderRadius: 7, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                ⬇ Export PDF
              </button>
            </div>
          )}
        </div>

        {/* Empty / not-generated state */}
        {results === null && (
          <div style={{
            background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB',
            padding: '64px 24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              Configure and generate your report
            </div>
            <div style={{ fontSize: 13, color: '#9CA3AF', maxWidth: 340, margin: '0 auto' }}>
              Use the panel on the left to choose filters and columns, then click Generate Report to see the results.
            </div>
          </div>
        )}

        {results !== null && results.length === 0 && (
          <div style={{
            background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB',
            padding: '64px 24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 8 }}>No tickets match these filters</div>
            <div style={{ fontSize: 13, color: '#9CA3AF' }}>Try loosening your filter criteria.</div>
          </div>
        )}

        {/* Results table */}
        {results !== null && results.length > 0 && (
          <div style={{
            background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB',
            overflow: 'hidden',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                    {activeCols.map((col) => (
                      <th key={col.key} style={{
                        padding: '10px 14px', textAlign: 'left',
                        fontSize: 11, fontWeight: 700, color: '#6B7280',
                        textTransform: 'uppercase', letterSpacing: '0.5px',
                        whiteSpace: 'nowrap',
                      }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((ticket, i) => (
                    <tr key={ticket.id} style={{
                      borderBottom: '1px solid #F3F4F6',
                      background: i % 2 === 0 ? '#fff' : '#FAFAFA',
                    }}>
                      {activeCols.map((col) => (
                        <td key={col.key} style={{
                          padding: '10px 14px', color: '#374151',
                          whiteSpace: col.key === 'title' ? 'normal' : 'nowrap',
                          maxWidth: col.key === 'title' ? 320 : undefined,
                        }}>
                          {col.key === 'status' ? (
                            <StatusChip status={ticket.status} />
                          ) : col.key === 'priority' ? (
                            <PriorityText priority={ticket.priority} />
                          ) : (
                            col.fmt ? col.fmt(ticket[col.key]) : (ticket[col.key] ?? '—')
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '10px 16px', borderTop: '1px solid #F3F4F6', fontSize: 11, color: '#9CA3AF' }}>
              {results.length} record{results.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inline mini-components for status/priority in table ───────────────────────

const STATUS_STYLES = {
  'Open':                 { bg: '#EFF6FF', text: '#1D4ED8' },
  'Pending':              { bg: '#FFF7ED', text: '#C2410C' },
  'In Investigation':     { bg: '#FEF3C7', text: '#92400E' },
  'Pending Engineering':  { bg: '#F3E8FF', text: '#7E22CE' },
  'Waiting on Customer':  { bg: '#FCE7F3', text: '#9D174D' },
  'Pending Release':      { bg: '#ECFDF5', text: '#065F46' },
  'Resolved':             { bg: '#F0FDF4', text: '#166534' },
  'Closed':               { bg: '#F9FAFB', text: '#6B7280' },
  'Canceled':             { bg: '#FEF2F2', text: '#991B1B' },
};

const PRIORITY_COLORS = {
  'Low':      '#6B7280',
  'Medium':   '#D97706',
  'High':     '#EA580C',
  'Critical': '#DC2626',
};

function StatusChip({ status }) {
  const s = STATUS_STYLES[status] || { bg: '#F3F4F6', text: '#374151' };
  return (
    <span style={{
      display: 'inline-block',
      background: s.bg, color: s.text,
      fontSize: 11, fontWeight: 600,
      padding: '2px 8px', borderRadius: 999,
      whiteSpace: 'nowrap',
    }}>
      {status || '—'}
    </span>
  );
}

function PriorityText({ priority }) {
  return (
    <span style={{ color: PRIORITY_COLORS[priority] || '#374151', fontWeight: 600, fontSize: 12 }}>
      {priority || '—'}
    </span>
  );
}
