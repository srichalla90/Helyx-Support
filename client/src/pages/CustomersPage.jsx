import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { useUser } from '../context/UserContext';

// ── Constants ─────────────────────────────────────────────────────────────────
export const LIFECYCLE_STATUSES = ['Potential', 'Discussion', 'Demo', 'Pilot', 'Contract', 'Onboarding', 'Active', 'Inactive', 'Declined'];

const LIFECYCLE_STYLES = {
  Potential:  { bg: '#F0F9FF', color: '#0369A1', border: '#BAE6FD', dot: '#38BDF8' },
  Discussion: { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA', dot: '#FB923C' },
  Demo:       { bg: '#FDF4FF', color: '#7E22CE', border: '#E9D5FF', dot: '#A855F7' },
  Pilot:      { bg: '#ECFDF5', color: '#065F46', border: '#6EE7B7', dot: '#34D399' },
  Contract:   { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', dot: '#F59E0B' },
  Onboarding: { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', dot: '#60A5FA' },
  Active:     { bg: '#F0FDF4', color: '#166534', border: '#A7F3D0', dot: '#10B981' },
  Inactive:   { bg: '#F9FAFB', color: '#374151', border: '#E5E7EB', dot: '#9CA3AF' },
  Declined:   { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA', dot: '#F87171' },
};

// Column names from XLSX → field key (case-insensitive matching)
const IMPORT_FIELD_MAP = {
  name:            ['name', 'company', 'company name', 'customer', 'customer name', 'organisation', 'organization'],
  lifecycle_status:['status', 'lifecycle', 'lifecycle status', 'stage'],
  industry:        ['industry', 'sector', 'vertical'],
  website:         ['website', 'url', 'web', 'domain'],
  phone:           ['phone', 'telephone', 'tel', 'mobile'],
  country:         ['country', 'region', 'location'],
  account_manager: ['account manager', 'owner', 'am', 'csm', 'manager'],
  notes:           ['notes', 'comments', 'description', 'details'],
  contact_name:    ['contact name', 'contact', 'primary contact', 'contact person'],
  contact_email:   ['contact email', 'email', 'primary email', 'contact e-mail'],
};

function autoMapColumns(headers) {
  const mapping = {}; // field → colHeader
  for (const [field, aliases] of Object.entries(IMPORT_FIELD_MAP)) {
    for (const h of headers) {
      if (aliases.includes(h.toLowerCase().trim())) {
        mapping[field] = h;
        break;
      }
    }
  }
  return mapping;
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const s = LIFECYCLE_STYLES[status] || LIFECYCLE_STYLES.Potential;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}

function blankForm() {
  return { name: '', lifecycle_status: 'Potential', contacts: [], industry: '', website: '', phone: '', country: '', account_manager: '', notes: '' };
}

// ── Contact editor (multi name+email) ─────────────────────────────────────────
function ContactsEditor({ contacts, onChange }) {
  const [newName,  setNewName]  = useState('');
  const [newEmail, setNewEmail] = useState('');

  function add() {
    if (!newName.trim() && !newEmail.trim()) return;
    onChange([...contacts, { name: newName.trim(), email: newEmail.trim() }]);
    setNewName(''); setNewEmail('');
  }
  function remove(i) { onChange(contacts.filter((_, idx) => idx !== i)); }

  return (
    <div>
      {contacts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {contacts.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 7, padding: '7px 10px' }}>
              <span style={{ fontSize: 14 }}>👤</span>
              <div style={{ flex: 1, fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: '#111827' }}>{c.name || '—'}</span>
                {c.email && <span style={{ color: '#6B7280', marginLeft: 8 }}>{c.email}</span>}
              </div>
              <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 16, padding: '0 2px', lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Contact name"
          style={{ flex: 1, padding: '7px 10px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 7, outline: 'none' }} />
        <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Email address"
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          style={{ flex: 1, padding: '7px 10px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 7, outline: 'none' }} />
        <button onClick={add} style={{ padding: '7px 14px', fontSize: 12, fontWeight: 700, background: '#1E293B', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add</button>
      </div>
    </div>
  );
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────
function CustomerModal({ customer, onSave, onClose }) {
  const [form, setForm] = useState(customer ? { ...customer, contacts: customer.contacts || [] } : blankForm());
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const isEdit = !!customer;

  const inp = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 7, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' };

  async function save() {
    if (!form.name.trim()) return toast('Customer name is required', 'error');
    setSaving(true);
    try {
      const payload = { ...form, contacts: JSON.stringify(form.contacts) };
      const result = isEdit ? await api.updateCustomer(customer.id, payload) : await api.createCustomer(payload);
      onSave(result);
      toast(isEdit ? 'Customer updated' : 'Customer created', 'success');
      onClose();
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '24px 20px', overflowY: 'auto' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 620, boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #F3F4F6' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>{isEdit ? 'Edit Customer' : 'Add Customer'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9CA3AF', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Name + Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Customer Name <span style={{ color: '#EF4444' }}>*</span></label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Acme Corp" style={inp} autoFocus />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Lifecycle Status</label>
              <select value={form.lifecycle_status} onChange={(e) => setForm((f) => ({ ...f, lifecycle_status: e.target.value }))} style={inp}>
                {LIFECYCLE_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Contacts */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Contacts</label>
            <ContactsEditor contacts={form.contacts} onChange={(c) => setForm((f) => ({ ...f, contacts: c }))} />
          </div>

          {/* Industry + Country */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Industry</label>
              <input value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} placeholder="e.g. Pharma" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Country / Region</label>
              <input value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} placeholder="e.g. United States" style={inp} />
            </div>
          </div>

          {/* Website + Phone */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Website</label>
              <input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://…" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Phone</label>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 0000" style={inp} />
            </div>
          </div>

          {/* Account Manager */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Account Manager</label>
            <input value={form.account_manager} onChange={(e) => setForm((f) => ({ ...f, account_manager: e.target.value }))} placeholder="Name or email of internal owner" style={inp} />
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3}
              placeholder="Any additional context…"
              style={{ ...inp, resize: 'vertical', minHeight: 72 }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '9px 20px', fontSize: 13, fontWeight: 600, border: '1px solid #D1D5DB', borderRadius: 8, background: '#fff', color: '#374151', cursor: 'pointer' }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ padding: '9px 24px', fontSize: 13, fontWeight: 600, background: saving ? '#93C5FD' : '#1E293B', color: '#fff', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Customer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Import Modal ──────────────────────────────────────────────────────────────
function ImportModal({ onImported, onClose }) {
  const toast = useToast();
  const fileRef = useRef();
  const [step, setStep]       = useState('upload'); // upload | map | preview | importing | done
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState([]);
  const [result,  setResult]  = useState(null);

  const MAPPABLE_FIELDS = [
    { key: 'name',            label: 'Customer Name *' },
    { key: 'lifecycle_status',label: 'Lifecycle Status' },
    { key: 'industry',        label: 'Industry' },
    { key: 'website',         label: 'Website' },
    { key: 'phone',           label: 'Phone' },
    { key: 'country',         label: 'Country' },
    { key: 'account_manager', label: 'Account Manager' },
    { key: 'notes',           label: 'Notes' },
    { key: 'contact_name',    label: 'Contact Name (1st)' },
    { key: 'contact_email',   label: 'Contact Email (1st)' },
  ];

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (data.length < 2) return toast('File appears empty', 'error');
        const hdrs = data[0].map(String);
        const rows = data.slice(1).filter((r) => r.some((v) => String(v).trim()));
        setHeaders(hdrs);
        setRawRows(rows);
        setMapping(autoMapColumns(hdrs));
        setStep('map');
      } catch (err) { toast('Could not parse file: ' + err.message, 'error'); }
    };
    reader.readAsArrayBuffer(file);
  }

  function buildPreview() {
    const rows = rawRows.slice(0, 5).map((row) => {
      const obj = {};
      for (const [field, col] of Object.entries(mapping)) {
        const idx = headers.indexOf(col);
        if (idx >= 0) obj[field] = String(row[idx] || '').trim();
      }
      return obj;
    });
    setPreview(rows);
    setStep('preview');
  }

  function buildImportRows() {
    return rawRows.map((row) => {
      const obj = {};
      for (const [field, col] of Object.entries(mapping)) {
        const idx = headers.indexOf(col);
        if (idx >= 0) obj[field] = String(row[idx] || '').trim();
      }
      // Merge contact_name + contact_email into contacts array
      const contacts = [];
      if (obj.contact_name || obj.contact_email) {
        contacts.push({ name: obj.contact_name || '', email: obj.contact_email || '' });
      }
      delete obj.contact_name; delete obj.contact_email;
      obj.contacts = JSON.stringify(contacts);
      return obj;
    });
  }

  async function runImport() {
    setStep('importing');
    try {
      const rows = buildImportRows();
      const res = await api.bulkImportCustomers(rows);
      setResult(res);
      setStep('done');
      onImported();
    } catch (e) { toast(e.message, 'error'); setStep('preview'); }
  }

  const selStyle = { padding: '6px 8px', fontSize: 12, border: '1px solid #D1D5DB', borderRadius: 6, background: '#fff', outline: 'none', width: '100%' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 700, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #E5E7EB', flexShrink: 0 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>Import Customers from Excel / CSV</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9CA3AF' }}>×</button>
        </div>

        <div style={{ overflowY: 'auto', padding: 24, flex: 1 }}>

          {/* ── Step 1: Upload ── */}
          {step === 'upload' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
              <p style={{ fontSize: 14, color: '#374151', marginBottom: 20 }}>Upload an <strong>.xlsx</strong> or <strong>.csv</strong> file. The first row must be column headers.</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
              <button onClick={() => fileRef.current.click()} style={{ padding: '10px 24px', fontSize: 14, fontWeight: 600, background: '#1E293B', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                Choose File
              </button>
              <div style={{ marginTop: 20, background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#1D4ED8', textAlign: 'left', maxWidth: 460, margin: '20px auto 0' }}>
                💡 Supported columns: <strong>Name, Status, Industry, Website, Phone, Country, Account Manager, Notes, Contact Name, Contact Email</strong> — column names are matched automatically.
              </div>
            </div>
          )}

          {/* ── Step 2: Map columns ── */}
          {step === 'map' && (
            <div>
              <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
                Found <strong>{rawRows.length} rows</strong> and <strong>{headers.length} columns</strong>. Review the column mapping below, then click Preview.
              </p>
              <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left', color: '#6B7280', fontWeight: 600 }}>Field</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', color: '#6B7280', fontWeight: 600 }}>Map to column</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MAPPABLE_FIELDS.map(({ key, label }) => (
                      <tr key={key} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '9px 14px', fontWeight: key === 'name' ? 700 : 500, color: '#111827' }}>{label}</td>
                        <td style={{ padding: '9px 14px' }}>
                          <select value={mapping[key] || ''} onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value || undefined }))} style={selStyle}>
                            <option value="">— Skip —</option>
                            {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button onClick={() => setStep('upload')} style={{ padding: '9px 18px', fontSize: 13, fontWeight: 600, border: '1px solid #D1D5DB', borderRadius: 8, background: '#fff', color: '#374151', cursor: 'pointer' }}>Back</button>
                <button onClick={buildPreview} disabled={!mapping.name} style={{ padding: '9px 24px', fontSize: 13, fontWeight: 600, background: mapping.name ? '#1E293B' : '#D1D5DB', color: '#fff', border: 'none', borderRadius: 8, cursor: mapping.name ? 'pointer' : 'not-allowed' }}>
                  Preview →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Preview ── */}
          {step === 'preview' && (
            <div>
              <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
                Previewing first {preview.length} of <strong>{rawRows.length}</strong> rows. Existing customers with the same name will be skipped.
              </p>
              <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'auto', marginBottom: 20 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                      {['Name','Status','Industry','Country','Contact'].map((h) => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#6B7280', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#111827' }}>{r.name || <span style={{ color: '#EF4444' }}>Missing!</span>}</td>
                        <td style={{ padding: '8px 12px' }}>{r.lifecycle_status || 'Potential'}</td>
                        <td style={{ padding: '8px 12px', color: '#6B7280' }}>{r.industry || '—'}</td>
                        <td style={{ padding: '8px 12px', color: '#6B7280' }}>{r.country || '—'}</td>
                        <td style={{ padding: '8px 12px', color: '#6B7280' }}>{[r.contact_name, r.contact_email].filter(Boolean).join(' / ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button onClick={() => setStep('map')} style={{ padding: '9px 18px', fontSize: 13, fontWeight: 600, border: '1px solid #D1D5DB', borderRadius: 8, background: '#fff', color: '#374151', cursor: 'pointer' }}>Back</button>
                <button onClick={runImport} style={{ padding: '9px 24px', fontSize: 13, fontWeight: 600, background: '#1E293B', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                  Import {rawRows.length} customers →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Importing ── */}
          {step === 'importing' && (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ width: 40, height: 40, border: '4px solid #E5E7EB', borderTop: '4px solid #2563EB', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 16px' }} />
              <p style={{ fontSize: 14, color: '#6B7280' }}>Importing customers…</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ── Step 5: Done ── */}
          {step === 'done' && result && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Import complete</h3>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 24 }}>
                <div style={{ background: '#F0FDF4', border: '1px solid #A7F3D0', borderRadius: 10, padding: '14px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#065F46' }}>{result.inserted}</div>
                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>Imported</div>
                </div>
                <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '14px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#92400E' }}>{result.skipped}</div>
                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>Skipped</div>
                </div>
                {result.errors > 0 && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '14px 24px', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#991B1B' }}>{result.errors}</div>
                    <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>Errors</div>
                  </div>
                )}
              </div>
              <button onClick={onClose} style={{ padding: '9px 28px', fontSize: 14, fontWeight: 600, background: '#1E293B', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const user    = useUser();
  const isAdmin = user?.role === 'admin';
  const toast   = useToast();

  const [customers,    setCustomers]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showModal,    setShowModal]    = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [showImport,   setShowImport]   = useState(false);
  const [statusFilter, setStatusFilter] = useState('All');
  const [search,       setSearch]       = useState('');

  async function load() {
    setLoading(true);
    try { setCustomers(await api.getCustomers()); }
    catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function handleSaved(updated) {
    setCustomers((prev) => {
      const exists = prev.find((c) => c.id === updated.id);
      return exists ? prev.map((c) => c.id === updated.id ? updated : c) : [...prev, updated];
    });
  }

  async function toggleActive(c) {
    try {
      const updated = await api.setCustomerActive(c.id, c.active === 0);
      setCustomers((prev) => prev.map((x) => x.id === updated.id ? updated : x));
      toast(c.active === 0 ? 'Customer activated' : 'Customer deactivated', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  // Lifecycle summary counts
  const counts = {};
  for (const s of LIFECYCLE_STATUSES) counts[s] = customers.filter((c) => c.lifecycle_status === s).length;

  // Filtered list
  const shown = customers.filter((c) => {
    if (statusFilter !== 'All' && c.lifecycle_status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const contacts = Array.isArray(c.contacts) ? c.contacts : [];
      if (!c.name.toLowerCase().includes(q) &&
          !c.industry?.toLowerCase().includes(q) &&
          !c.country?.toLowerCase().includes(q) &&
          !contacts.some((ct) => ct.name?.toLowerCase().includes(q) || ct.email?.toLowerCase().includes(q)))
        return false;
    }
    return true;
  });

  return (
    <div>
      {/* Modals */}
      {(showModal || editCustomer) && (
        <CustomerModal
          customer={editCustomer}
          onSave={handleSaved}
          onClose={() => { setShowModal(false); setEditCustomer(null); }}
        />
      )}
      {showImport && (
        <ImportModal onImported={load} onClose={() => setShowImport(false)} />
      )}

      {/* Page header */}
      <div className="page-header">
        <div>
          <h2>Customers</h2>
          <p>Manage your customer pipeline and onboarding progress</p>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowImport(true)} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              ⬆ Import
            </button>
            <button onClick={() => { setEditCustomer(null); setShowModal(true); }} className="btn btn-primary btn-sm">
              + Add Customer
            </button>
          </div>
        )}
      </div>

      {/* Lifecycle summary strip */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <button
          onClick={() => setStatusFilter('All')}
          style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, borderRadius: 20, cursor: 'pointer', border: `1px solid ${statusFilter === 'All' ? '#1E293B' : '#E5E7EB'}`, background: statusFilter === 'All' ? '#1E293B' : '#fff', color: statusFilter === 'All' ? '#fff' : '#6B7280', transition: 'all 0.15s' }}>
          All ({customers.length})
        </button>
        {LIFECYCLE_STATUSES.map((s) => {
          const st = LIFECYCLE_STYLES[s];
          const active = statusFilter === s;
          return (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '7px 16px', fontSize: 12, fontWeight: 700, borderRadius: 20, cursor: 'pointer',
              border: `1px solid ${active ? st.color : st.border}`,
              background: active ? st.bg : '#fff',
              color: active ? st.color : '#6B7280',
              transition: 'all 0.15s',
            }}>
              <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: st.dot, marginRight: 6 }} />
              {s} ({counts[s] || 0})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', marginBottom: 16, maxWidth: 360 }}>
        <span style={{ color: '#9CA3AF' }}>🔍</span>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, industry, country, contact…"
          style={{ border: 'none', background: 'none', outline: 'none', fontSize: 13, width: '100%', color: '#374151' }} />
        {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 16, lineHeight: 1 }}>×</button>}
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : shown.length === 0 ? (
        <div className="data-table-wrap">
          <div className="empty-state">
            <div className="empty-icon">🏢</div>
            <h3>{customers.length === 0 ? 'No customers yet' : 'No results'}</h3>
            <p>{customers.length === 0 ? 'Add customers to link them to support tickets.' : 'Try a different filter or search.'}</p>
          </div>
        </div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Lifecycle</th>
                <th>Contacts</th>
                <th>Industry</th>
                <th>Country</th>
                <th>Account Manager</th>
                <th>Added</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const contacts = Array.isArray(c.contacts) ? c.contacts : [];
                return (
                  <tr key={c.id} style={{ opacity: c.active === 0 ? 0.5 : 1 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>🏢</span>
                        <div>
                          <div style={{ fontWeight: 600, color: '#111827', fontSize: 13 }}>{c.name}</div>
                          {c.website && <div style={{ fontSize: 11, color: '#2563EB' }}><a href={c.website.startsWith('http') ? c.website : 'https://' + c.website} target="_blank" rel="noreferrer" style={{ color: '#2563EB' }}>{c.website.replace(/^https?:\/\//, '')}</a></div>}
                        </div>
                      </div>
                    </td>
                    <td><StatusBadge status={c.lifecycle_status || 'Potential'} /></td>
                    <td>
                      {contacts.length === 0 ? <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {contacts.slice(0, 2).map((ct, i) => (
                            <div key={i} style={{ fontSize: 12, color: '#374151' }}>
                              {ct.name && <span style={{ fontWeight: 500 }}>{ct.name}</span>}
                              {ct.email && <span style={{ color: '#6B7280', marginLeft: ct.name ? 6 : 0 }}>{ct.email}</span>}
                            </div>
                          ))}
                          {contacts.length > 2 && <span style={{ fontSize: 11, color: '#9CA3AF' }}>+{contacts.length - 2} more</span>}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: '#6B7280' }}>{c.industry || '—'}</td>
                    <td style={{ fontSize: 12, color: '#6B7280' }}>{c.country || '—'}</td>
                    <td style={{ fontSize: 12, color: '#6B7280' }}>{c.account_manager || '—'}</td>
                    <td style={{ fontSize: 12, color: '#9CA3AF' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                    {isAdmin && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost btn-sm" style={{ marginRight: 4 }} onClick={() => setEditCustomer(c)}>Edit</button>
                        <button onClick={() => toggleActive(c)} style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer', border: c.active === 0 ? '1px solid #E5E7EB' : '1px solid #BBF7D0', background: c.active === 0 ? '#F3F4F6' : '#F0FDF4', color: c.active === 0 ? '#6B7280' : '#166534' }}>
                          {c.active === 0 ? 'Activate' : 'Deactivate'}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
