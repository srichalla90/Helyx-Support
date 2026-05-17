import { useState, useEffect, useRef } from 'react';
import { useToast } from '../components/Toast';
import { api, STATUSES, PRIORITIES, TICKET_TYPES } from '../api';
import { useProducts } from '../context/ProductsContext';

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

function FilterDropdown({ label, options, selected, onChange, multi = true }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const hasSelection = multi ? selected.length > 0 : !!selected;
  const displayText = !hasSelection
    ? <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>All</span>
    : multi && selected.length > 1
      ? <span style={{ color: '#1D4ED8', fontWeight: 600 }}>{selected.length} selected</span>
      : (() => {
          const val = multi ? selected[0] : selected;
          const lbl = options.find((o) => (o.value ?? o) === val);
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
        <span style={{
          fontSize: 11, fontWeight: 700, color: hasSelection ? '#1E40AF' : '#6B7280',
          textTransform: 'uppercase', letterSpacing: '0.5px',
          minWidth: 60, marginRight: 6, flexShrink: 0,
        }}>
          {label}
        </span>
        <span style={{ flex: 1, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayText}
        </span>
        {hasSelection && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onChange(multi ? [] : ''); }}
            style={{ fontSize: 11, color: '#93C5FD', marginRight: 6, lineHeight: 1, cursor: 'pointer', padding: '0 2px' }}
            title="Clear"
          >✕</span>
        )}
        <svg
          width="10" height="10" viewBox="0 0 10 10"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.45 }}
        >
          <path d="M1 3 L5 7 L9 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
          background: '#fff',
          border: '1px solid #BFDBFE', borderTop: 'none',
          borderRadius: '0 0 7px 7px',
          boxShadow: '0 6px 18px rgba(0,0,0,0.09)',
          maxHeight: 224, overflowY: 'auto',
        }}>
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

// ── Save Report Modal ─────────────────────────────────────────────────────────

function SaveReportModal({ onSave, onClose, saving }) {
  const [name, setName] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSubmit(e) {
    e.preventDefault();
    if (name.trim()) onSave(name.trim());
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, padding: '28px 28px 24px',
        width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Save Report</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>
          Give this report a name so you can find it later. Agents and admins can see all saved reports.
        </div>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            placeholder="e.g. Open Critical Tickets — Q3"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            style={{
              width: '100%', padding: '9px 12px', fontSize: 14,
              border: '1px solid #D1D5DB', borderRadius: 7,
              outline: 'none', boxSizing: 'border-box',
              marginBottom: 20,
            }}
            onFocus={(e) => { e.target.style.borderColor = '#6366F1'; }}
            onBlur={(e) => { e.target.style.borderColor = '#D1D5DB'; }}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 18px', fontSize: 13, fontWeight: 600,
                background: '#F3F4F6', color: '#374151',
                border: '1px solid #E5E7EB', borderRadius: 7, cursor: 'pointer',
              }}
            >Cancel</button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              style={{
                padding: '8px 18px', fontSize: 13, fontWeight: 700,
                background: '#1E293B', color: '#fff',
                border: 'none', borderRadius: 7, cursor: name.trim() && !saving ? 'pointer' : 'not-allowed',
                opacity: !name.trim() || saving ? 0.65 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Export helpers ────────────────────────────────────────────────────────────

function exportCSV(rows, activeCols, filename) {
  const header = activeCols.map((c) => `"${c.label}"`).join(',');
  const lines = rows.map((row) =>
    activeCols.map((c) => {
      // Apply the column's fmt function (handles dates, IDs, etc.) just like the table display does.
      // Fall back to raw string if no fmt defined.
      const raw = c.fmt
        ? (c.fmt(row[c.key]) ?? '')
        : (row[c.key] != null ? String(row[c.key]) : '');
      return `"${String(raw).replace(/"/g, '""')}"`;
    }).join(',')
  );
  const csv = [header, ...lines].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `helyx-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportPDF(rows, activeCols, filterSummary, reportName) {
  const tableRows = rows.map((row) =>
    `<tr>${activeCols.map((c) => `<td>${c.fmt ? c.fmt(row[c.key]) : (row[c.key] ?? '—')}</td>`).join('')}</tr>`
  ).join('');

  const title = reportName || 'Helyx Support — Ticket Report';
  const generatedAt = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #111; font-size: 12px; margin: 0; padding: 0; }
    .header { background: #1E293B; color: #fff; padding: 18px 28px 14px; }
    .header h1 { font-size: 17px; margin: 0 0 4px; }
    .header .meta { font-size: 11px; color: #94A3B8; }
    .content { padding: 20px 28px; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th { background: #F1F5F9; color: #374151; padding: 7px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #E2E8F0; }
    td { padding: 7px 10px; border-bottom: 1px solid #F1F5F9; vertical-align: top; font-size: 11px; color: #1E293B; }
    tr:nth-child(even) td { background: #F8FAFC; }
    @media print {
      @page { margin: 0.5in; size: landscape; }
      .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <div class="meta">Generated ${generatedAt} &nbsp;·&nbsp; ${rows.length} ticket${rows.length !== 1 ? 's' : ''}${filterSummary ? ' &nbsp;·&nbsp; Filters: ' + filterSummary : ''}</div>
  </div>
  <div class="content">
    <table>
      <thead><tr>${activeCols.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>
  <script>
    // Auto-open print dialog so user can Save as PDF
    window.addEventListener('load', function() {
      window.print();
    });
  </script>
</body>
</html>`;

  // Open in a new tab and let the browser's print → Save as PDF handle it.
  // This produces a real PDF with correct page layout rather than an HTML download.
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  } else {
    // Popup blocked — fall back to downloading the HTML file with instructions
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = (reportName || 'helyx-report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    a.download = `${slug}-${new Date().toISOString().slice(0, 10)}.html`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// ── Status / Priority mini-components ────────────────────────────────────────

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

// ── Results Table ─────────────────────────────────────────────────────────────

function ResultsTable({ results, activeCols }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
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
  );
}

// ── Tab: Generate Report ──────────────────────────────────────────────────────

function GenerateTab({ customers, groups, onReportSaved }) {
  const { products: PRODUCTS } = useProducts();
  const toast = useToast();

  const [results,      setResults]      = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [showSaveModal,setShowSaveModal]= useState(false);

  // Filters
  const [selStatuses,   setSelStatuses]   = useState([]);
  const [selPriorities, setSelPriorities] = useState([]);
  const [selTypes,      setSelTypes]      = useState([]);
  const [selProducts,   setSelProducts]   = useState([]);
  const [selCustomer,   setSelCustomer]   = useState('');
  const [selGroup,      setSelGroup]      = useState('');

  // Columns
  const [activeColKeys, setActiveColKeys] = useState(DEFAULT_COLUMNS);

  function toggleColumn(key) {
    const col = ALL_COLUMNS.find((c) => c.key === key);
    if (col?.required) return;
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

  function getFilterSummary() {
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

  async function handleSave(name) {
    setSaving(true);
    try {
      const filters = {
        statuses: selStatuses,
        priorities: selPriorities,
        types: selTypes,
        products: selProducts,
        customer: selCustomer,
        group: selGroup,
      };
      await api.saveReport({ name, filters, columns: activeColKeys });
      toast(`"${name}" saved successfully`, 'success');
      setShowSaveModal(false);
      onReportSaved?.();
    } catch (e) {
      toast(e.message || 'Failed to save report', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

      {/* Left: config panel */}
      <div style={{
        width: 224, flexShrink: 0,
        background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB',
        padding: '20px 16px',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 20 }}>Configure Report</div>

        <div style={{ fontSize: 11, fontWeight: 700, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 12 }}>
          Filters
        </div>

        <FilterDropdown label="Status"   options={STATUSES}     selected={selStatuses}    onChange={setSelStatuses} />
        <FilterDropdown label="Priority" options={PRIORITIES}   selected={selPriorities}  onChange={setSelPriorities} />
        <FilterDropdown label="Type"     options={TICKET_TYPES} selected={selTypes}       onChange={setSelTypes} />
        <FilterDropdown label="Product"  options={PRODUCTS}     selected={selProducts}    onChange={setSelProducts} />
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
            opacity: loading ? 0.7 : 1, marginBottom: 8,
          }}
        >
          {loading ? 'Loading…' : results === null ? 'Generate Report' : 'Refresh Report'}
        </button>

        {results !== null && results.length > 0 && (
          <button
            onClick={() => setShowSaveModal(true)}
            style={{
              width: '100%', padding: '9px 0',
              background: '#fff', color: '#1E293B',
              border: '1.5px solid #1E293B', borderRadius: 7, fontWeight: 700,
              fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <span style={{ fontSize: 14 }}>💾</span> Save Report
          </button>
        )}
      </div>

      {/* Right: results */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            {results !== null && (
              <>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#111827' }}>
                  {results.length} ticket{results.length !== 1 ? 's' : ''}
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{getFilterSummary()}</div>
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
                onClick={() => exportPDF(results, activeCols, getFilterSummary())}
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

        {results !== null && results.length > 0 && (
          <ResultsTable results={results} activeCols={activeCols} />
        )}
      </div>

      {showSaveModal && (
        <SaveReportModal
          onSave={handleSave}
          onClose={() => setShowSaveModal(false)}
          saving={saving}
        />
      )}
    </div>
  );
}

// ── Edit Report Modal ─────────────────────────────────────────────────────────

function EditReportModal({ report, customers, groups, onSave, onClose, saving }) {
  const { products: PRODUCTS } = useProducts();

  const [name,          setName]          = useState(report.name);
  const [selStatuses,   setSelStatuses]   = useState(report.filters?.statuses   || []);
  const [selPriorities, setSelPriorities] = useState(report.filters?.priorities || []);
  const [selTypes,      setSelTypes]      = useState(report.filters?.types      || []);
  const [selProducts,   setSelProducts]   = useState(report.filters?.products   || []);
  const [selCustomer,   setSelCustomer]   = useState(report.filters?.customer   || '');
  const [selGroup,      setSelGroup]      = useState(report.filters?.group      || '');
  const [activeColKeys, setActiveColKeys] = useState(
    report.columns?.length ? report.columns : DEFAULT_COLUMNS
  );

  const nameRef = useRef(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  // Dirty state — only enable Save Changes if something actually changed
  const isDirty = (() => {
    if (name !== report.name) return true;
    if (JSON.stringify(selStatuses)   !== JSON.stringify(report.filters?.statuses   || [])) return true;
    if (JSON.stringify(selPriorities) !== JSON.stringify(report.filters?.priorities || [])) return true;
    if (JSON.stringify(selTypes)      !== JSON.stringify(report.filters?.types      || [])) return true;
    if (JSON.stringify(selProducts)   !== JSON.stringify(report.filters?.products   || [])) return true;
    if (selCustomer !== (report.filters?.customer || '')) return true;
    if (selGroup    !== (report.filters?.group    || '')) return true;
    const origCols = report.columns?.length ? report.columns : DEFAULT_COLUMNS;
    if (JSON.stringify(activeColKeys) !== JSON.stringify(origCols)) return true;
    return false;
  })();

  function toggleColumn(key) {
    const col = ALL_COLUMNS.find((c) => c.key === key);
    if (col?.required) return;
    setActiveColKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      filters: {
        statuses: selStatuses, priorities: selPriorities,
        types: selTypes, products: selProducts,
        customer: selCustomer, group: selGroup,
      },
      columns: activeColKeys,
    });
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}
    >
      <div style={{
        background: '#fff', borderRadius: 14,
        width: '100%', maxWidth: 640,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
      }}>
        {/* Modal header */}
        <div style={{
          padding: '22px 28px 18px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#111827' }}>Edit Report</div>
            <div style={{ fontSize: 12.5, color: '#9CA3AF', marginTop: 2 }}>
              Update name, filters, and columns — changes save immediately.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 20, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1, padding: 4 }}
          >×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ padding: '22px 28px', display: 'flex', gap: 24 }}>

            {/* Left: filters + columns */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Report name */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
                  Report Name
                </label>
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  style={{
                    width: '100%', padding: '9px 12px', fontSize: 14,
                    border: '1px solid #D1D5DB', borderRadius: 7,
                    outline: 'none', boxSizing: 'border-box', color: '#111827',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#6366F1'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#D1D5DB'; }}
                />
              </div>

              {/* Filters */}
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>
                Filters
              </div>
              <FilterDropdown label="Status"   options={STATUSES}     selected={selStatuses}    onChange={setSelStatuses} />
              <FilterDropdown label="Priority" options={PRIORITIES}   selected={selPriorities}  onChange={setSelPriorities} />
              <FilterDropdown label="Type"     options={TICKET_TYPES} selected={selTypes}       onChange={setSelTypes} />
              <FilterDropdown label="Product"  options={PRODUCTS}     selected={selProducts}    onChange={setSelProducts} />
              <FilterDropdown
                label="Customer" multi={false}
                options={customers.map((c) => ({ value: String(c.id), label: c.name }))}
                selected={selCustomer} onChange={setSelCustomer}
              />
              <FilterDropdown
                label="Group" multi={false}
                options={groups.map((g) => ({ value: String(g.id), label: g.name }))}
                selected={selGroup} onChange={setSelGroup}
              />
            </div>

            {/* Right: column picker */}
            <div style={{ width: 180, flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>
                Columns
              </div>
              {ALL_COLUMNS.map((col) => (
                <label key={col.key} style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  fontSize: 12.5, color: col.required ? '#9CA3AF' : '#374151',
                  marginBottom: 7, cursor: col.required ? 'default' : 'pointer',
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
          </div>

          {/* Footer */}
          <div style={{
            padding: '16px 28px',
            borderTop: '1px solid #F3F4F6',
            display: 'flex', justifyContent: 'flex-end', gap: 10,
          }}>
            <button
              type="button" onClick={onClose}
              style={{
                padding: '9px 20px', fontSize: 13, fontWeight: 600,
                background: '#F3F4F6', color: '#374151',
                border: '1px solid #E5E7EB', borderRadius: 7, cursor: 'pointer',
              }}
            >Cancel</button>
            <button
              type="submit"
              disabled={!name.trim() || !isDirty || saving}
              style={{
                padding: '9px 20px', fontSize: 13, fontWeight: 700,
                background: isDirty && name.trim() && !saving ? '#1E293B' : '#9CA3AF',
                color: '#fff',
                border: 'none', borderRadius: 7,
                cursor: isDirty && name.trim() && !saving ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'background 0.15s',
              }}
              title={!isDirty ? 'No changes to save' : undefined}
            >
              {saving ? 'Saving…' : '✓ Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Tab: Saved Reports ────────────────────────────────────────────────────────

function SavedReportsTab({ customers, groups, refreshKey }) {
  const toast = useToast();

  const [savedReports,  setSavedReports]  = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [expanded,      setExpanded]      = useState(null); // report id being previewed
  const [previewData,   setPreviewData]   = useState({});   // { [id]: { rows, loading, error } }
  const [deleting,      setDeleting]      = useState(null);
  const [editing,       setEditing]       = useState(null); // report being edited
  const [updateSaving,  setUpdateSaving]  = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // report pending delete confirmation

  useEffect(() => {
    setLoading(true);
    api.getSavedReports()
      .then(setSavedReports)
      .catch((e) => toast(e.message || 'Failed to load saved reports', 'error'))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  async function loadPreview(report) {
    if (expanded === report.id) {
      setExpanded(null);
      return;
    }
    setExpanded(report.id);

    if (previewData[report.id]) return; // already loaded

    setPreviewData((prev) => ({ ...prev, [report.id]: { rows: null, loading: true, error: null } }));
    try {
      const all = await api.getTickets();
      const f   = report.filters || {};

      const filtered = all.filter((t) => {
        if (f.statuses?.length   && !f.statuses.includes(t.status))        return false;
        if (f.priorities?.length && !f.priorities.includes(t.priority))    return false;
        if (f.types?.length      && !f.types.includes(t.type))             return false;
        if (f.products?.length   && !f.products.includes(t.product))       return false;
        if (f.customer           && String(t.customer_id) !== f.customer)  return false;
        if (f.group              && String(t.group_id)    !== f.group)      return false;
        return true;
      });

      setPreviewData((prev) => ({ ...prev, [report.id]: { rows: filtered, loading: false, error: null } }));
    } catch (e) {
      setPreviewData((prev) => ({ ...prev, [report.id]: { rows: null, loading: false, error: e.message } }));
    }
  }

  async function handleDelete(report) {
    setConfirmDelete(report);
  }

  async function confirmDeleteReport() {
    const report = confirmDelete;
    setConfirmDelete(null);
    setDeleting(report.id);
    try {
      await api.deleteReport(report.id);
      setSavedReports((prev) => prev.filter((r) => r.id !== report.id));
      if (expanded === report.id) setExpanded(null);
      toast(`"${report.name}" deleted`, 'success');
    } catch (e) {
      toast(e.message || 'Failed to delete report', 'error');
    } finally {
      setDeleting(null);
    }
  }

  function handleExportCSV(report) {
    const data = previewData[report.id];
    if (!data?.rows) return toast('Open the report first to export', 'error');
    const cols = (report.columns?.length ? report.columns : DEFAULT_COLUMNS)
      .map((k) => ALL_COLUMNS.find((c) => c.key === k))
      .filter(Boolean);
    const slug = report.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    exportCSV(data.rows, cols, `${slug}-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function handleExportPDF(report) {
    const data = previewData[report.id];
    if (!data?.rows) return toast('Open the report first to export', 'error');
    const cols = (report.columns?.length ? report.columns : DEFAULT_COLUMNS)
      .map((k) => ALL_COLUMNS.find((c) => c.key === k))
      .filter(Boolean);
    exportPDF(data.rows, cols, buildFilterLabel(report, customers, groups), report.name);
  }

  async function handleUpdate(updatedFields) {
    setUpdateSaving(true);
    try {
      const updated = await api.updateReport(editing.id, updatedFields);
      setSavedReports((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      // Invalidate cached preview so it re-runs with new filters
      setPreviewData((prev) => { const n = { ...prev }; delete n[updated.id]; return n; });
      if (expanded === updated.id) setExpanded(null); // collapse so user sees the updated card
      toast(`"${updated.name}" updated`, 'success');
      setEditing(null);
    } catch (e) {
      toast(e.message || 'Failed to update report', 'error');
    } finally {
      setUpdateSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{
        background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB',
        padding: '64px 24px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>Loading saved reports…</div>
      </div>
    );
  }

  if (savedReports.length === 0) {
    return (
      <div style={{
        background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB',
        padding: '64px 24px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 8 }}>No saved reports yet</div>
        <div style={{ fontSize: 13, color: '#9CA3AF', maxWidth: 340, margin: '0 auto' }}>
          Generate a report on the Generate Report tab, then click Save Report to store it here.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, color: '#6B7280' }}>
        {savedReports.length} saved report{savedReports.length !== 1 ? 's' : ''} — visible to all agents and admins
      </div>

      {editing && (
        <EditReportModal
          report={editing}
          customers={customers}
          groups={groups}
          onSave={handleUpdate}
          onClose={() => setEditing(null)}
          saving={updateSaving}
        />
      )}

      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}
        >
          <div style={{
            background: '#fff', borderRadius: 12, padding: '28px 28px 24px',
            width: '100%', maxWidth: 420,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{ fontSize: 20, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
              Delete this report?
            </div>
            <div style={{ fontSize: 13.5, color: '#6B7280', marginBottom: 24, lineHeight: 1.5 }}>
              <strong style={{ color: '#374151' }}>{confirmDelete.name}</strong> will be permanently deleted and cannot be recovered.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{
                  padding: '9px 20px', fontSize: 13, fontWeight: 600,
                  background: '#F3F4F6', color: '#374151',
                  border: '1px solid #E5E7EB', borderRadius: 7, cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                onClick={confirmDeleteReport}
                style={{
                  padding: '9px 20px', fontSize: 13, fontWeight: 700,
                  background: '#DC2626', color: '#fff',
                  border: 'none', borderRadius: 7, cursor: 'pointer',
                }}
              >Delete Report</button>
            </div>
          </div>
        </div>
      )}

      {savedReports.map((report) => {
        const isExpanded  = expanded === report.id;
        const preview     = previewData[report.id];
        const activeCols  = (report.columns?.length ? report.columns : DEFAULT_COLUMNS)
          .map((k) => ALL_COLUMNS.find((c) => c.key === k))
          .filter(Boolean);
        const filterLabel = buildFilterLabel(report, customers, groups);

        return (
          <div key={report.id} style={{
            background: '#fff',
            borderRadius: 10,
            border: `1px solid ${isExpanded ? '#BFDBFE' : '#E5E7EB'}`,
            boxShadow: isExpanded ? '0 0 0 3px rgba(59,130,246,0.06)' : '0 1px 3px rgba(0,0,0,0.04)',
            overflow: 'hidden',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}>

            {/* ── Card header ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '16px 20px',
              background: isExpanded ? '#F0F7FF' : '#fff',
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
              onClick={() => loadPreview(report)}
              onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = '#F9FAFB'; }}
              onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = '#fff'; }}
            >
              {/* Icon */}
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: '#EFF6FF', border: '1px solid #BFDBFE',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, flexShrink: 0,
              }}>📊</div>

              {/* Name + meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 15, fontWeight: 700, color: '#1D4ED8',
                  marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {report.name}
                  <span style={{ fontSize: 11, color: '#93C5FD', fontWeight: 500 }}>
                    {isExpanded ? '▲ collapse' : '▼ open'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <span>Saved {fmtDate(report.created_at)}</span>
                  {report.created_by && <span>by <strong style={{ color: '#6B7280' }}>{report.created_by}</strong></span>}
                  {filterLabel && (
                    <span style={{
                      background: '#F3F4F6', color: '#374151',
                      fontSize: 11, fontWeight: 600,
                      padding: '1px 8px', borderRadius: 999,
                    }}>
                      {filterLabel}
                    </span>
                  )}
                  {!filterLabel && (
                    <span style={{
                      background: '#F3F4F6', color: '#6B7280',
                      fontSize: 11, fontWeight: 500,
                      padding: '1px 8px', borderRadius: 999,
                    }}>
                      All tickets
                    </span>
                  )}
                </div>
              </div>

              {/* Action buttons — stop propagation so they don't expand */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleExportCSV(report)}
                  title="Export as CSV"
                  style={{
                    padding: '6px 14px', fontSize: 12, fontWeight: 700,
                    background: '#F8FAFC', color: '#374151',
                    border: '1px solid #E5E7EB', borderRadius: 7, cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#E5E7EB'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#F8FAFC'; }}
                >⬇ CSV</button>
                <button
                  onClick={() => handleExportPDF(report)}
                  title="Export as PDF"
                  style={{
                    padding: '6px 14px', fontSize: 12, fontWeight: 700,
                    background: '#F8FAFC', color: '#374151',
                    border: '1px solid #E5E7EB', borderRadius: 7, cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#E5E7EB'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#F8FAFC'; }}
                >⬇ PDF</button>
                <button
                  onClick={() => setEditing(report)}
                  title="Edit report"
                  style={{
                    padding: '6px 14px', fontSize: 12, fontWeight: 700,
                    background: '#EFF6FF', color: '#1D4ED8',
                    border: '1px solid #BFDBFE', borderRadius: 7, cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#DBEAFE'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#EFF6FF'; }}
                >✏ Edit</button>
                <button
                  onClick={() => handleDelete(report)}
                  disabled={deleting === report.id}
                  title="Delete report"
                  style={{
                    padding: '6px 14px', fontSize: 12, fontWeight: 700,
                    background: '#FEF2F2', color: '#DC2626',
                    border: '1px solid #FECACA', borderRadius: 7,
                    cursor: deleting === report.id ? 'not-allowed' : 'pointer',
                    opacity: deleting === report.id ? 0.6 : 1,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { if (deleting !== report.id) e.currentTarget.style.background = '#FEE2E2'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#FEF2F2'; }}
                >
                  {deleting === report.id ? '…' : '🗑 Delete'}
                </button>
              </div>
            </div>

            {/* ── Columns strip (always visible, below header) ── */}
            <div style={{
              padding: '8px 20px',
              borderTop: '1px solid #F3F4F6',
              background: '#FAFAFA',
              display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: 4 }}>Columns:</span>
              {activeCols.map((c) => (
                <span key={c.key} style={{
                  fontSize: 11, fontWeight: 600, color: '#374151',
                  background: '#EFF6FF', border: '1px solid #BFDBFE',
                  borderRadius: 5, padding: '1px 8px',
                }}>{c.label}</span>
              ))}
            </div>

            {/* ── Expanded preview ── */}
            {isExpanded && (
              <div style={{ padding: '16px 20px', borderTop: '1px solid #BFDBFE', background: '#F8FAFC' }}>
                {preview?.loading && (
                  <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>
                    Loading tickets…
                  </div>
                )}
                {preview?.error && (
                  <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: '#DC2626' }}>
                    Error: {preview.error}
                  </div>
                )}
                {preview?.rows && preview.rows.length === 0 && (
                  <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>
                    No tickets match the saved filters.
                  </div>
                )}
                {preview?.rows && preview.rows.length > 0 && (
                  <>
                    <div style={{
                      fontSize: 12, color: '#6B7280', marginBottom: 12,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ fontWeight: 600, color: '#374151' }}>
                        {preview.rows.length} ticket{preview.rows.length !== 1 ? 's' : ''}
                        <span style={{ fontWeight: 400, color: '#9CA3AF' }}> · {filterLabel || 'All tickets'}</span>
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => handleExportCSV(report)} style={{
                          padding: '5px 14px', fontSize: 12, fontWeight: 700,
                          background: '#1E293B', color: '#fff',
                          border: 'none', borderRadius: 6, cursor: 'pointer',
                        }}>⬇ Export CSV</button>
                        <button onClick={() => handleExportPDF(report)} style={{
                          padding: '5px 14px', fontSize: 12, fontWeight: 700,
                          background: '#1E293B', color: '#fff',
                          border: 'none', borderRadius: 6, cursor: 'pointer',
                        }}>⬇ Export PDF</button>
                      </div>
                    </div>
                    <ResultsTable results={preview.rows} activeCols={activeCols} />
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Helper: build a human-readable filter summary for a saved report
function buildFilterLabel(report, customers, groups) {
  const f = report.filters || {};
  const parts = [];
  if (f.statuses?.length)   parts.push(f.statuses.join(', '));
  if (f.priorities?.length) parts.push(f.priorities.join(', '));
  if (f.types?.length)      parts.push(f.types.join(', '));
  if (f.products?.length)   parts.push(f.products.join(', '));
  if (f.customer) {
    const c = customers.find((x) => String(x.id) === f.customer);
    if (c) parts.push(c.name);
  }
  if (f.group) {
    const g = groups.find((x) => String(x.id) === f.group);
    if (g) parts.push(g.name);
  }
  return parts.join(' · ');
}

// ── Main ReportsPage ──────────────────────────────────────────────────────────

export default function ReportsPage() {
  const toast = useToast();
  const [customers,  setCustomers]  = useState([]);
  const [groups,     setGroups]     = useState([]);
  const [activeTab,  setActiveTab]  = useState('generate'); // 'generate' | 'saved'
  const [savedKey,   setSavedKey]   = useState(0); // bump to refresh saved list

  useEffect(() => {
    Promise.all([api.getCustomers(), api.getGroups()])
      .then(([c, g]) => {
        setCustomers(c.filter((x) => x.active !== 0));
        setGroups(g.filter((x) => x.active !== 0));
      })
      .catch(() => {});
  }, []);

  function handleReportSaved() {
    setSavedKey((k) => k + 1); // refresh saved tab if it's open
  }

  // Tab bar styles
  const tabBase = {
    padding: '8px 20px', fontSize: 13.5, fontWeight: 600,
    border: 'none', borderRadius: '8px 8px 0 0',
    cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* Page header */}
      <div style={{ marginBottom: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 4 }}>Reports</div>
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>Generate, save, and export ticket reports</div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 2,
        borderBottom: '2px solid #E5E7EB',
        marginTop: 20, marginBottom: 24,
      }}>
        <button
          onClick={() => setActiveTab('generate')}
          style={{
            ...tabBase,
            background: activeTab === 'generate' ? '#1E293B' : 'transparent',
            color: activeTab === 'generate' ? '#fff' : '#6B7280',
          }}
        >
          📊 Generate Report
        </button>
        <button
          onClick={() => { setActiveTab('saved'); setSavedKey((k) => k + 1); }}
          style={{
            ...tabBase,
            background: activeTab === 'saved' ? '#1E293B' : 'transparent',
            color: activeTab === 'saved' ? '#fff' : '#6B7280',
          }}
        >
          💾 Saved Reports
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'generate' && (
        <GenerateTab
          customers={customers}
          groups={groups}
          onReportSaved={handleReportSaved}
        />
      )}
      {activeTab === 'saved' && (
        <SavedReportsTab
          customers={customers}
          groups={groups}
          refreshKey={savedKey}
        />
      )}
    </div>
  );
}
