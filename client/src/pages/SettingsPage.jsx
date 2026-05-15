import { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { api } from '../api';
import { useUser } from '../context/UserContext';
import { useToast } from '../components/Toast';
import EmailTemplatesPage from './EmailTemplatesPage';

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, description, children }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12,
      overflow: 'hidden', marginBottom: 24,
    }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #F3F4F6' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 4 }}>{title}</div>
        {description && <div style={{ fontSize: 13, color: '#6B7280' }}>{description}</div>}
      </div>
      <div style={{ padding: '24px' }}>{children}</div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 12, color: '#9CA3AF' }}>{hint}</span>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text', disabled }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: '100%', boxSizing: 'border-box',
        padding: '9px 12px', fontSize: 14, color: '#111827',
        border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none',
        background: disabled ? '#F9FAFB' : '#fff', fontFamily: 'inherit',
      }}
      onFocus={(e) => { if (!disabled) e.target.style.borderColor = '#2563EB'; }}
      onBlur={(e)  => { e.target.style.borderColor = '#D1D5DB'; }}
    />
  );
}

function Toggle({ checked, onChange, label, description }) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'flex-start', gap: 14, cursor: 'pointer', marginBottom: 16 }}
      onClick={() => onChange(!checked)}
    >
      <div style={{
        width: 40, height: 22, borderRadius: 11, flexShrink: 0, marginTop: 1,
        background: checked ? '#2563EB' : '#D1D5DB',
        transition: 'background 0.2s', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: 3, left: checked ? 21 : 3,
          width: 16, height: 16, borderRadius: '50%', background: '#fff',
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{description}</div>}
      </div>
    </div>
  );
}

// ── Canned Responses Tab ──────────────────────────────────────────────────────
function CannedResponsesTab() {
  const user = useUser();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';

  const [responses, setResponses] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [editing,   setEditing]   = useState(null); // {id, title, body, category} or null
  const [saving,    setSaving]    = useState(false);
  const [showNew,   setShowNew]   = useState(false);
  const [newForm,   setNewForm]   = useState({ title: '', body: '', category: 'General' });

  useEffect(() => {
    api.getCannedResponses().then(setResponses).catch(() => toast('Failed to load', 'error')).finally(() => setLoading(false));
  }, []);

  async function createResponse() {
    if (!newForm.title.trim()) return toast('Title required', 'error');
    setSaving(true);
    try {
      const created = await api.createCannedResponse(newForm);
      setResponses((prev) => [...prev, created]);
      setShowNew(false);
      setNewForm({ title: '', body: '', category: 'General' });
      toast('Created', 'success');
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }

  async function updateResponse() {
    setSaving(true);
    try {
      const updated = await api.updateCannedResponse(editing.id, editing);
      setResponses((prev) => prev.map((r) => r.id === editing.id ? updated : r));
      setEditing(null);
      toast('Saved', 'success');
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }

  async function deleteResponse(id) {
    if (!window.confirm('Delete this canned response?')) return;
    try {
      await api.deleteCannedResponse(id);
      setResponses((prev) => prev.filter((r) => r.id !== id));
      toast('Deleted', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  const categories = [...new Set(responses.map((r) => r.category))].sort();

  if (loading) return <div style={{ color: '#9CA3AF', fontSize: 13, padding: 20 }}>Loading…</div>;

  const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '8px 12px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 7, outline: 'none', fontFamily: 'inherit' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>Canned Responses ({responses.length})</h3>
        {isAdmin && (
          <button onClick={() => setShowNew(true)} style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, background: '#2563EB', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
            + New Response
          </button>
        )}
      </div>

      {/* New Response Form */}
      {showNew && (
        <div style={{ background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Title *</label>
            <input value={newForm.title} onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))} style={inputStyle} placeholder="e.g. Thanks for reaching out" />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Category</label>
            <input value={newForm.category} onChange={(e) => setNewForm((f) => ({ ...f, category: e.target.value }))} style={inputStyle} placeholder="e.g. Greetings" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Body (HTML or plain text)</label>
            <textarea value={newForm.body} onChange={(e) => setNewForm((f) => ({ ...f, body: e.target.value }))} rows={5} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace' }} placeholder="Your canned reply text here…" />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowNew(false)} style={{ padding: '7px 14px', fontSize: 13, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 7, cursor: 'pointer' }}>Cancel</button>
            <button onClick={createResponse} disabled={saving} style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, background: '#2563EB', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
              {saving ? 'Saving…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Response list grouped by category */}
      {responses.length === 0 ? (
        <div style={{ color: '#9CA3AF', fontSize: 13, padding: 20, textAlign: 'center' }}>No canned responses yet.</div>
      ) : (
        categories.map((cat) => (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{cat}</div>
            {responses.filter((r) => r.category === cat).map((r) => (
              <div key={r.id} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: '12px 14px', marginBottom: 8 }}>
                {editing?.id === r.id ? (
                  <div>
                    <input value={editing.title} onChange={(e) => setEditing((f) => ({ ...f, title: e.target.value }))} style={{ ...inputStyle, marginBottom: 8 }} />
                    <input value={editing.category} onChange={(e) => setEditing((f) => ({ ...f, category: e.target.value }))} style={{ ...inputStyle, marginBottom: 8 }} placeholder="Category" />
                    <textarea value={editing.body} onChange={(e) => setEditing((f) => ({ ...f, body: e.target.value }))} rows={4} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', marginBottom: 8 }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={updateResponse} disabled={saving} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: '#2563EB', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
                      <button onClick={() => setEditing(null)} style={{ padding: '6px 12px', fontSize: 12, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 7, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{r.title}</div>
                      <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(r.body.replace(/<[^>]+>/g, ' ').slice(0, 100)) }}
                      />
                    </div>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                        <button onClick={() => setEditing({ ...r })} style={{ padding: '4px 10px', fontSize: 12, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer' }}>Edit</button>
                        <button onClick={() => deleteResponse(r.id)} style={{ padding: '4px 10px', fontSize: 12, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 6, cursor: 'pointer' }}>Delete</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

// ── SLA Tab ────────────────────────────────────────────────────────────────────
function SLATab() {
  const user = useUser();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';
  const [policies, setPolicies] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(null);
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    api.getSLAPolicies().then(setPolicies).catch(() => toast('Failed to load SLA policies', 'error')).finally(() => setLoading(false));
  }, []);

  async function savePolicy() {
    setSaving(true);
    try {
      let updated;
      if (editing.id) {
        updated = await api.updateSLAPolicy(editing.id, editing);
        setPolicies((prev) => prev.map((p) => p.id === editing.id ? updated : p));
      } else {
        updated = await api.createSLAPolicy(editing);
        setPolicies((prev) => [...prev, updated]);
      }
      setEditing(null);
      toast('SLA policy saved', 'success');
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }

  async function deletePolicy(id) {
    if (!window.confirm('Delete this SLA policy? This cannot be undone.')) return;
    try {
      await api.deleteSLAPolicy(id);
      setPolicies((prev) => prev.filter((p) => p.id !== id));
      toast('SLA policy deleted', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  if (loading) return <div style={{ color: '#9CA3AF', fontSize: 13 }}>Loading…</div>;

  const inputStyle = { padding: '7px 10px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 7, outline: 'none', width: '100%', boxSizing: 'border-box' };
  const PRIORITY_COLORS = { 'Critical': '#DC2626', 'High': '#EA580C', 'Medium': '#D97706', 'Low': '#6B7280' };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>SLA Policies</h3>
        {isAdmin && (
          <button onClick={() => setEditing({ name: '', priority: 'Medium', first_response_hours: 8, resolution_hours: 48 })}
            style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, background: '#2563EB', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
            + Add Policy
          </button>
        )}
      </div>

      {editing && (
        <div style={{ background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#111827' }}>{editing.id ? 'Edit' : 'New'} SLA Policy</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Name</label>
              <input value={editing.name} onChange={(e) => setEditing((f) => ({ ...f, name: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Priority</label>
              <select value={editing.priority} onChange={(e) => setEditing((f) => ({ ...f, priority: e.target.value }))} style={inputStyle}>
                {['Low', 'Medium', 'High', 'Critical'].map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>First Response (hours)</label>
              <input type="number" value={editing.first_response_hours} onChange={(e) => setEditing((f) => ({ ...f, first_response_hours: Number(e.target.value) }))} style={inputStyle} min={1} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Resolution (hours)</label>
              <input type="number" value={editing.resolution_hours} onChange={(e) => setEditing((f) => ({ ...f, resolution_hours: Number(e.target.value) }))} style={inputStyle} min={1} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={savePolicy} disabled={saving} style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, background: '#2563EB', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={() => setEditing(null)} style={{ padding: '7px 12px', fontSize: 13, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 7, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
              <th style={{ padding: '10px 14px', textAlign: 'left', color: '#6B7280', fontWeight: 600 }}>Name</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', color: '#6B7280', fontWeight: 600 }}>Priority</th>
              <th style={{ padding: '10px 14px', textAlign: 'right', color: '#6B7280', fontWeight: 600 }}>First Response</th>
              <th style={{ padding: '10px 14px', textAlign: 'right', color: '#6B7280', fontWeight: 600 }}>Resolution</th>
              {isAdmin && <th style={{ padding: '10px 14px' }}></th>}
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '10px 14px', fontWeight: 500, color: '#111827' }}>{p.name}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ fontWeight: 700, color: PRIORITY_COLORS[p.priority] || '#374151' }}>{p.priority}</span>
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right', color: '#374151' }}>{p.first_response_hours}h</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', color: '#374151' }}>{p.resolution_hours}h</td>
                {isAdmin && (
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <button onClick={() => setEditing({ ...p })} style={{ padding: '4px 10px', fontSize: 12, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer', marginRight: 6 }}>Edit</button>
                    <button onClick={() => deletePolicy(p.id)} style={{ padding: '4px 10px', fontSize: 12, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 6, cursor: 'pointer' }}>Delete</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── CSAT Tab ──────────────────────────────────────────────────────────────────
function CSATTab() {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    api.getCsatStats().then(setStats).catch(() => toast('Failed to load CSAT stats', 'error')).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#9CA3AF', fontSize: 13 }}>Loading…</div>;
  if (!stats)  return null;

  const avgPct = stats.avg_rating ? (stats.avg_rating / 5) * 100 : 0;
  const avgColor = avgPct >= 80 ? '#166534' : avgPct >= 60 ? '#92400E' : '#991B1B';
  const avgBg    = avgPct >= 80 ? '#F0FDF4' : avgPct >= 60 ? '#FFFBEB' : '#FEF2F2';

  return (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 16 }}>CSAT Overview</h3>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        <div style={{ background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Surveys Sent</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#111827' }}>{stats.total_sent}</div>
        </div>
        <div style={{ background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Responses</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#111827' }}>{stats.total_submitted}</div>
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
            {stats.total_sent > 0 ? `${Math.round((stats.total_submitted / stats.total_sent) * 100)}% response rate` : '—'}
          </div>
        </div>
        <div style={{ background: avgBg, border: `1px solid ${avgPct >= 80 ? '#BBF7D0' : avgPct >= 60 ? '#FDE68A' : '#FECACA'}`, borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Avg Rating</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: avgColor }}>
            {stats.avg_rating ? stats.avg_rating.toFixed(1) : '—'}
            {stats.avg_rating && <span style={{ fontSize: 14 }}>/5</span>}
          </div>
          {stats.avg_rating && (
            <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
              {[1,2,3,4,5].map((n) => <span key={n} style={{ fontSize: 14, color: n <= Math.round(stats.avg_rating) ? '#F59E0B' : '#E5E7EB' }}>★</span>)}
            </div>
          )}
        </div>
      </div>

      {/* Rating breakdown */}
      {stats.total_submitted > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 20px' }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Rating Breakdown</h4>
          {[5, 4, 3, 2, 1].map((rating) => {
            const found = stats.by_rating?.find((r) => r.rating === rating);
            const count = found?.count || 0;
            const pct   = stats.total_submitted > 0 ? (count / stats.total_submitted) * 100 : 0;
            return (
              <div key={rating} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ width: 20, fontSize: 13, color: '#374151', fontWeight: 600 }}>{rating}</span>
                <span style={{ fontSize: 14, color: '#F59E0B' }}>★</span>
                <div style={{ flex: 1, height: 8, background: '#F3F4F6', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: rating >= 4 ? '#10B981' : rating === 3 ? '#F59E0B' : '#EF4444', borderRadius: 4, transition: 'width 0.5s' }} />
                </div>
                <span style={{ fontSize: 12, color: '#6B7280', width: 36, textAlign: 'right' }}>{count}</span>
                <span style={{ fontSize: 12, color: '#9CA3AF', width: 40, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 12, background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#1D4ED8' }}>
        💡 CSAT surveys are sent from individual ticket pages (Requester section → Send CSAT Survey) after a ticket is resolved.
      </div>
    </div>
  );
}

// ── Custom Fields Tab ─────────────────────────────────────────────────────────
const FIELD_TYPES = ['text', 'number', 'dropdown', 'date', 'checkbox', 'url', 'textarea'];
const FIELD_TYPE_LABELS = { text: 'Text', number: 'Number', dropdown: 'Dropdown', date: 'Date', checkbox: 'Checkbox', url: 'URL', textarea: 'Long Text' };
const FIELD_TYPE_COLORS = { text: '#EFF6FF', number: '#FFF7ED', dropdown: '#F0FDF4', date: '#FDF4FF', checkbox: '#FFF1F2', url: '#F0FDFA', textarea: '#F8FAFC' };

function blankField() {
  return { label: '', field_type: 'text', options: [], required: false, optionInput: '' };
}

function CustomFieldsTab() {
  const user = useUser();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';

  const [fields,  setFields]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | { ...field, optionInput: '' }
  const [isNew,   setIsNew]   = useState(false);
  const [saving,  setSaving]  = useState(false);

  function load() {
    return api.getCustomFields({ include_inactive: '1' })
      .then(setFields)
      .catch(() => toast('Failed to load custom fields', 'error'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function startNew() {
    setEditing(blankField());
    setIsNew(true);
  }

  function startEdit(f) {
    setEditing({ ...f, options: f.options || [], optionInput: '' });
    setIsNew(false);
  }

  function cancelEdit() {
    setEditing(null);
    setIsNew(false);
  }

  function addOption() {
    const opt = (editing.optionInput || '').trim();
    if (!opt) return;
    if (editing.options.includes(opt)) return toast('Option already exists', 'error');
    setEditing((f) => ({ ...f, options: [...f.options, opt], optionInput: '' }));
  }

  function removeOption(opt) {
    setEditing((f) => ({ ...f, options: f.options.filter((o) => o !== opt) }));
  }

  async function save() {
    if (!editing.label.trim()) return toast('Label is required', 'error');
    if (editing.field_type === 'dropdown' && editing.options.length === 0) return toast('Dropdown fields need at least one option', 'error');
    setSaving(true);
    try {
      const payload = { label: editing.label.trim(), field_type: editing.field_type, options: editing.options, required: editing.required };
      let result;
      if (isNew) {
        result = await api.createCustomField(payload);
        setFields((prev) => [...prev, result]);
        toast('Field created', 'success');
      } else {
        result = await api.updateCustomField(editing.id, { ...payload, active: editing.active });
        setFields((prev) => prev.map((f) => f.id === editing.id ? result : f));
        toast('Field updated', 'success');
      }
      cancelEdit();
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }

  async function toggleActive(field) {
    try {
      if (field.active) {
        await api.deleteCustomField(field.id);
        setFields((prev) => prev.map((f) => f.id === field.id ? { ...f, active: false } : f));
        toast('Field deactivated', 'success');
      } else {
        const updated = await api.updateCustomField(field.id, { label: field.label, field_type: field.field_type, options: field.options, required: field.required, active: true });
        setFields((prev) => prev.map((f) => f.id === field.id ? updated : f));
        toast('Field activated', 'success');
      }
    } catch (e) { toast(e.message, 'error'); }
  }

  const inputStyle = { padding: '7px 10px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 7, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };

  if (loading) return <div style={{ color: '#9CA3AF', fontSize: 13 }}>Loading…</div>;

  const activeFields   = fields.filter((f) => f.active);
  const inactiveFields = fields.filter((f) => !f.active);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>Custom Ticket Fields ({activeFields.length} active)</h3>
        {isAdmin && (
          <button onClick={startNew} style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, background: '#2563EB', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
            + New Field
          </button>
        )}
      </div>

      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#1D4ED8', marginBottom: 16 }}>
        💡 Custom fields appear in the ticket details sidebar. Agents and admins can fill them in per ticket. Admins define the schema here.
      </div>

      {/* Editor */}
      {editing && (
        <div style={{ background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#111827' }}>{isNew ? 'New Custom Field' : 'Edit Field'}</h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Label *</label>
              <input value={editing.label} onChange={(e) => setEditing((f) => ({ ...f, label: e.target.value }))} style={inputStyle} placeholder="e.g. ADO Bug ID" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Field Type *</label>
              <select value={editing.field_type} onChange={(e) => setEditing((f) => ({ ...f, field_type: e.target.value, options: [] }))} style={inputStyle}>
                {FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
          </div>

          {/* Dropdown options */}
          {editing.field_type === 'dropdown' && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Dropdown Options</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {editing.options.map((opt) => (
                  <span key={opt} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#E0F2FE', color: '#0369A1', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                    {opt}
                    {isAdmin && <button onClick={() => removeOption(opt)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0369A1', fontSize: 14, lineHeight: 1, padding: '0 0 0 2px' }}>×</button>}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={editing.optionInput || ''}
                  onChange={(e) => setEditing((f) => ({ ...f, optionInput: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addOption())}
                  style={{ ...inputStyle, flex: 1 }}
                  placeholder="Type an option and press Enter"
                />
                <button onClick={addOption} style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#E0F2FE', color: '#0369A1', border: 'none', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap' }}>Add</button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <input type="checkbox" id="cf-required" checked={editing.required || false} onChange={(e) => setEditing((f) => ({ ...f, required: e.target.checked }))} style={{ width: 15, height: 15, cursor: 'pointer' }} />
            <label htmlFor="cf-required" style={{ fontSize: 13, color: '#374151', cursor: 'pointer', userSelect: 'none' }}>Mark as required</label>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={saving} style={{ padding: '7px 20px', fontSize: 13, fontWeight: 600, background: '#2563EB', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' }}>{saving ? 'Saving…' : isNew ? 'Create Field' : 'Save Changes'}</button>
            <button onClick={cancelEdit} style={{ padding: '7px 14px', fontSize: 13, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 7, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Active fields */}
      {activeFields.length === 0 && !editing ? (
        <div style={{ color: '#9CA3AF', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>No custom fields yet. Click "+ New Field" to create one.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: inactiveFields.length > 0 ? 20 : 0 }}>
          {activeFields.map((f) => (
            <div key={f.id} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{f.label}</span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: FIELD_TYPE_COLORS[f.field_type] || '#F3F4F6', color: '#374151', fontWeight: 600 }}>
                    {FIELD_TYPE_LABELS[f.field_type] || f.field_type}
                  </span>
                  {f.required && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#FEF2F2', color: '#DC2626', fontWeight: 600 }}>Required</span>}
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                  internal name: <code style={{ background: '#F3F4F6', padding: '0 4px', borderRadius: 3 }}>{f.name}</code>
                  {f.field_type === 'dropdown' && f.options?.length > 0 && (
                    <span style={{ marginLeft: 8 }}>Options: {f.options.join(', ')}</span>
                  )}
                </div>
              </div>
              {isAdmin && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => startEdit(f)} style={{ padding: '4px 10px', fontSize: 12, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer' }}>Edit</button>
                  <button onClick={() => toggleActive(f)} style={{ padding: '4px 10px', fontSize: 12, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 6, cursor: 'pointer' }}>Deactivate</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Inactive fields */}
      {isAdmin && inactiveFields.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Deactivated Fields</div>
          {inactiveFields.map((f) => (
            <div key={f.id} style={{ background: '#F9FAFB', border: '1px solid #F3F4F6', borderRadius: 8, padding: '10px 16px', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: 0.7 }}>
              <div style={{ fontSize: 13, color: '#6B7280' }}>{f.label} <span style={{ fontSize: 11 }}>({FIELD_TYPE_LABELS[f.field_type]})</span></div>
              <button onClick={() => toggleActive(f)} style={{ padding: '4px 10px', fontSize: 12, background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0', borderRadius: 6, cursor: 'pointer' }}>Activate</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Automation Rules Tab ──────────────────────────────────────────────────────
const CONDITION_FIELDS = ['priority', 'status', 'type', 'source', 'product', 'title', 'requester_email'];
const CONDITION_OPS    = ['is', 'is_not', 'contains', 'not_contains'];
const ACTION_TYPES     = ['set_priority', 'set_status', 'set_group', 'set_assignee', 'add_tag'];
const ACTION_LABELS    = { set_priority: 'Set Priority', set_status: 'Set Status', set_group: 'Set Group', set_assignee: 'Set Assignee', add_tag: 'Add Tag' };

function AutomationTab() {
  const user = useUser();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';

  const [rules,   setRules]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [groups,  setGroups]  = useState([]);
  const [agents,  setAgents]  = useState([]);

  useEffect(() => {
    Promise.all([
      api.getAutomationRules(),
      api.getGroups(),
      api.getUsers(),
    ]).then(([r, g, u]) => {
      setRules(r);
      setGroups(g);
      setAgents(u.filter((usr) => usr.role !== 'customer'));
    }).catch(() => toast('Failed to load', 'error')).finally(() => setLoading(false));
  }, []);

  function newRule() {
    setEditing({
      name: '',
      event: 'ticket_created',
      conditions: [{ field: 'priority', operator: 'is', value: 'Critical' }],
      actions: [{ type: 'set_priority', value: 'Critical' }],
      active: true,
    });
  }

  async function saveRule() {
    if (!editing.name.trim()) return toast('Name required', 'error');
    setSaving(true);
    try {
      let result;
      if (editing.id) {
        result = await api.updateAutomationRule(editing.id, editing);
        setRules((prev) => prev.map((r) => r.id === editing.id ? result : r));
      } else {
        result = await api.createAutomationRule(editing);
        setRules((prev) => [...prev, result]);
      }
      setEditing(null);
      toast('Automation rule saved', 'success');
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }

  async function deleteRule(id) {
    if (!window.confirm('Delete this rule?')) return;
    try {
      await api.deleteAutomationRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast('Deleted', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function toggleRule(id, active) {
    try {
      const updated = await api.toggleAutomationRule(id, active);
      setRules((prev) => prev.map((r) => r.id === id ? updated : r));
    } catch (e) { toast(e.message, 'error'); }
  }

  function addCondition() {
    setEditing((f) => ({ ...f, conditions: [...f.conditions, { field: 'priority', operator: 'is', value: '' }] }));
  }
  function removeCondition(i) {
    setEditing((f) => ({ ...f, conditions: f.conditions.filter((_, ci) => ci !== i) }));
  }
  function updateCondition(i, key, val) {
    setEditing((f) => ({ ...f, conditions: f.conditions.map((c, ci) => ci === i ? { ...c, [key]: val } : c) }));
  }
  function addAction() {
    setEditing((f) => ({ ...f, actions: [...f.actions, { type: 'set_priority', value: 'High' }] }));
  }
  function removeAction(i) {
    setEditing((f) => ({ ...f, actions: f.actions.filter((_, ai) => ai !== i) }));
  }
  function updateAction(i, key, val) {
    setEditing((f) => ({ ...f, actions: f.actions.map((a, ai) => ai === i ? { ...a, [key]: val } : a) }));
  }

  function actionValueOptions(type) {
    switch (type) {
      case 'set_priority': return ['Low', 'Medium', 'High', 'Critical'];
      case 'set_status':   return ['Open', 'Pending', 'In Investigation', 'Pending Engineering', 'Waiting on Customer', 'Pending Release', 'Resolved', 'Closed'];
      case 'set_group':    return groups.map((g) => ({ v: String(g.id), l: g.name }));
      case 'set_assignee': return agents.map((a) => ({ v: String(a.id), l: a.name }));
      default: return null; // free text
    }
  }

  const selStyle = { padding: '5px 8px', fontSize: 12, border: '1px solid #D1D5DB', borderRadius: 6, background: '#fff', outline: 'none' };
  const inpStyle = { padding: '5px 8px', fontSize: 12, border: '1px solid #D1D5DB', borderRadius: 6, outline: 'none', width: 120 };

  if (loading) return <div style={{ color: '#9CA3AF', fontSize: 13 }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>Automation Rules ({rules.length})</h3>
        {isAdmin && (
          <button onClick={newRule} style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, background: '#2563EB', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
            + New Rule
          </button>
        )}
      </div>

      {/* Rule editor */}
      {editing && (
        <div style={{ background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Rule Name</label>
            <input value={editing.name} onChange={(e) => setEditing((f) => ({ ...f, name: e.target.value }))} style={{ ...inpStyle, width: '100%' }} placeholder="e.g. Escalate critical tickets" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Trigger</label>
            <select value={editing.event} onChange={(e) => setEditing((f) => ({ ...f, event: e.target.value }))} style={selStyle}>
              <option value="ticket_created">When a ticket is created</option>
              <option value="ticket_updated">When a ticket is updated</option>
            </select>
          </div>

          {/* Conditions */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>IF all conditions match:</div>
            {editing.conditions.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                <select value={c.field} onChange={(e) => updateCondition(i, 'field', e.target.value)} style={selStyle}>
                  {CONDITION_FIELDS.map((f) => <option key={f}>{f}</option>)}
                </select>
                <select value={c.operator} onChange={(e) => updateCondition(i, 'operator', e.target.value)} style={selStyle}>
                  {CONDITION_OPS.map((op) => <option key={op}>{op}</option>)}
                </select>
                <input value={c.value} onChange={(e) => updateCondition(i, 'value', e.target.value)} style={inpStyle} placeholder="value" />
                <button onClick={() => removeCondition(i)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 16 }}>×</button>
              </div>
            ))}
            <button onClick={addCondition} style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>+ Add condition</button>
          </div>

          {/* Actions */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>THEN perform actions:</div>
            {editing.actions.map((a, i) => {
              const opts = actionValueOptions(a.type);
              return (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                  <select value={a.type} onChange={(e) => updateAction(i, 'type', e.target.value)} style={selStyle}>
                    {ACTION_TYPES.map((t) => <option key={t} value={t}>{ACTION_LABELS[t]}</option>)}
                  </select>
                  {opts ? (
                    <select value={a.value} onChange={(e) => updateAction(i, 'value', e.target.value)} style={selStyle}>
                      {Array.isArray(opts) && typeof opts[0] === 'string'
                        ? opts.map((o) => <option key={o}>{o}</option>)
                        : opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)
                      }
                    </select>
                  ) : (
                    <input value={a.value} onChange={(e) => updateAction(i, 'value', e.target.value)} style={inpStyle} placeholder="value" />
                  )}
                  <button onClick={() => removeAction(i)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 16 }}>×</button>
                </div>
              );
            })}
            <button onClick={addAction} style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>+ Add action</button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveRule} disabled={saving} style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, background: '#2563EB', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save Rule'}</button>
            <button onClick={() => setEditing(null)} style={{ padding: '7px 12px', fontSize: 13, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 7, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Rule list */}
      {rules.length === 0 ? (
        <div style={{ color: '#9CA3AF', fontSize: 13, padding: 20, textAlign: 'center' }}>No automation rules yet.</div>
      ) : (
        rules.map((r) => (
          <div key={r.id} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: '12px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{r.name}</span>
                <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 999, background: r.active ? '#DCFCE7' : '#F3F4F6', color: r.active ? '#166534' : '#9CA3AF', fontWeight: 600 }}>
                  {r.active ? 'Active' : 'Disabled'}
                </span>
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>on {r.event.replace('_', ' ')}</span>
              </div>
              <div style={{ fontSize: 12, color: '#6B7280' }}>
                {r.conditions?.length} condition(s) → {r.actions?.length} action(s)
              </div>
            </div>
            {isAdmin && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                <button onClick={() => toggleRule(r.id, !r.active)} style={{ padding: '4px 10px', fontSize: 12, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer' }}>
                  {r.active ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => setEditing({ ...r })} style={{ padding: '4px 10px', fontSize: 12, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer' }}>Edit</button>
                <button onClick={() => deleteRule(r.id)} style={{ padding: '4px 10px', fontSize: 12, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 6, cursor: 'pointer' }}>Delete</button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const user    = useUser();
  const toast   = useToast();
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState('general');
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [settings, setSettings] = useState({
    company_name:               'Helyx',
    support_email:              '',
    portal_url:                 '',
    announce_notify_customers:  '1',
    announce_notify_agents:     '0',
  });

  useEffect(() => {
    api.getSettings()
      .then((data) => setSettings((prev) => ({ ...prev, ...data })))
      .catch(() => toast('Failed to load settings', 'error'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.updateSettings(settings);
      setSettings((prev) => ({ ...prev, ...updated }));
      toast('Settings saved', 'success');
    } catch (err) {
      toast(err.message || 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  function set(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) {
    return <div style={{ padding: 40, color: '#6B7280', fontSize: 14 }}>Loading settings…</div>;
  }

  const TABS = [
    { key: 'general',         label: 'General' },
    { key: 'email-templates', label: 'Email Templates' },
    { key: 'canned',          label: 'Canned Responses' },
    { key: 'sla',             label: 'SLA' },
    { key: 'automation',      label: 'Automation' },
    { key: 'csat',            label: 'CSAT' },
    { key: 'custom-fields',   label: 'Custom Fields' },
  ];

  const TAB_STYLE = (tab) => ({
    padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: 'none', borderBottom: activeTab === tab ? '2px solid #2563EB' : '2px solid transparent',
    background: 'none', color: activeTab === tab ? '#2563EB' : '#6B7280',
    marginBottom: -1, transition: 'color 0.15s',
  });

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB', marginBottom: 24, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.key} style={TAB_STYLE(t.key)} onClick={() => setActiveTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {activeTab === 'email-templates' ? <EmailTemplatesPage /> :
       activeTab === 'canned'          ? <CannedResponsesTab /> :
       activeTab === 'sla'             ? <SLATab /> :
       activeTab === 'automation'      ? <AutomationTab /> :
       activeTab === 'csat'            ? <CSATTab /> :
       activeTab === 'custom-fields'   ? <CustomFieldsTab /> :
      (
        <form onSubmit={handleSave} style={{ maxWidth: 680 }}>
          <Section title="General" description="Basic branding and identity used across the portal and outbound emails.">
            <Field label="Company / Product Name" hint="Used in email subjects, headers, and the customer portal.">
              <TextInput value={settings.company_name} onChange={(v) => set('company_name', v)} placeholder="e.g. Helyx" disabled={!isAdmin} />
            </Field>
            <Field label="Support Email Address" hint="The mailbox used to send outbound emails (replies, announcements). Must match the SUPPORT_MAILBOX value configured in Microsoft Graph.">
              <TextInput type="email" value={settings.support_email} onChange={(v) => set('support_email', v)} placeholder="e.g. support@yourcompany.com" disabled={!isAdmin} />
            </Field>
            <Field label="Customer Portal URL" hint='The public URL of your customer portal. Used as the "View in Customer Portal" link in announcement emails and ticket notification emails.'>
              <TextInput type="url" value={settings.portal_url} onChange={(v) => set('portal_url', v)} placeholder="e.g. https://support.yourcompany.com" disabled={!isAdmin} />
            </Field>
          </Section>

          <Section title="Announcement Notifications" description="When an announcement is published, automatically send an email blast to the selected audience. Requires Microsoft Graph to be configured.">
            <Toggle
              checked={settings.announce_notify_customers === '1'}
              onChange={(v) => set('announce_notify_customers', v ? '1' : '0')}
              label="Email customers when an announcement is published"
              description="Sends to all users with the Customer role and all unique requester emails from existing tickets."
            />
            <Toggle
              checked={settings.announce_notify_agents === '1'}
              onChange={(v) => set('announce_notify_agents', v ? '1' : '0')}
              label="Email agents & admins when an announcement is published"
              description="Sends to all active users with the Agent or Admin role."
            />
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#166534', marginTop: 8 }}>
              💡 Email blasts are only fired on the <strong>first publish</strong> of an announcement (draft → published). Re-saving a published announcement will not re-send.
            </div>
          </Section>

          {isAdmin ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="submit" disabled={saving} style={{ padding: '9px 24px', fontSize: 14, fontWeight: 600, background: saving ? '#93C5FD' : '#2563EB', color: '#fff', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          ) : (
            <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#92400E' }}>
              🔒 Only admins can modify settings. Contact your administrator to make changes.
            </div>
          )}
        </form>
      )}
    </div>
  );
}
