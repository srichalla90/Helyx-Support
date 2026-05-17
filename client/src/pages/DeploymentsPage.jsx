import { useState, useEffect } from 'react';
import { api } from '../api';
import { useUser } from '../context/UserContext';
import { useToast } from '../components/Toast';

// ── Constants ─────────────────────────────────────────────────────────────────
const ENVIRONMENTS = ['Production', 'Validation', 'UAT', 'Training', 'Development'];

const STATUSES = ['Planned', 'Scheduled', 'In Progress', 'Completed', 'Failed', 'Rolled Back'];

const STATUS_STYLES = {
  'Planned':      { bg: '#F9FAFB', color: '#374151', border: '#E5E7EB' },
  'Scheduled':    { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  'In Progress':  { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
  'Completed':    { bg: '#F0FDF4', color: '#166534', border: '#A7F3D0' },
  'Failed':       { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
  'Rolled Back':  { bg: '#FDF4FF', color: '#7E22CE', border: '#E9D5FF' },
};

const ENV_STYLES = {
  'Production':  { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
  'Validation':  { bg: '#FFF7ED', color: '#92400E', border: '#FDE68A' },
  'UAT':         { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  'Training':    { bg: '#F0FDF4', color: '#065F46', border: '#A7F3D0' },
  'Development': { bg: '#F9FAFB', color: '#374151', border: '#E5E7EB' },
};

function blank() {
  return {
    customer_id: '', environment: 'Production', version: '',
    status: 'Planned', assigned_to: '', deployed_at: '', notes: '',
  };
}

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES['Planned'];
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      {status}
    </span>
  );
}

// ── EnvBadge ──────────────────────────────────────────────────────────────────
function EnvBadge({ env }) {
  const s = ENV_STYLES[env] || ENV_STYLES['Development'];
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      {env}
    </span>
  );
}

// ── DeploymentModal (Add / Edit / Detail) ─────────────────────────────────────
function DeploymentModal({ deployment, product, customers, users, onClose, onSaved }) {
  const user    = useUser();
  const toast   = useToast();
  const isAdmin = user?.role === 'admin';
  const isNew   = !deployment?.id;

  const [form,    setForm]    = useState(() => deployment
    ? {
        customer_id:  deployment.customer_id  || '',
        environment:  deployment.environment  || 'Production',
        version:      deployment.version      || '',
        status:       deployment.status       || 'Planned',
        assigned_to:  deployment.assigned_to  || '',
        deployed_at:  deployment.deployed_at  ? deployment.deployed_at.split('T')[0] : '',
        notes:        deployment.notes        || '',
      }
    : blank()
  );
  const [saving,      setSaving]      = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [attachments, setAttachments] = useState(deployment?.attachments || []);
  const [confirmDeleteAtt, setConfirmDeleteAtt] = useState(null);
  const fileRef = useRef();

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const inp = {
    width: '100%', padding: '8px 10px', fontSize: 13,
    border: '1px solid #D1D5DB', borderRadius: 7, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit', background: isAdmin ? '#fff' : '#F9FAFB',
  };

  async function handleSave() {
    if (!form.environment) return toast('Environment is required', 'error');
    setSaving(true);
    try {
      const body = {
        product_id:   product.id,
        product_name: product.name,
        customer_id:  form.customer_id   || null,
        environment:  form.environment,
        version:      form.version.trim(),
        status:       form.status,
        assigned_to:  form.assigned_to   || null,
        deployed_at:  form.deployed_at   || null,
        notes:        form.notes.trim(),
      };
      const saved = isNew
        ? await api.createDeployment(body)
        : await api.updateDeployment(deployment.id, body);
      toast(isNew ? 'Deployment created' : 'Deployment saved', 'success');
      onSaved(saved);
    } catch (e) { toast(e.message || 'Failed to save', 'error'); }
    finally { setSaving(false); }
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !deployment?.id) return;
    setUploading(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      fd.append('uploaded_by', user?.name || 'Agent');
      const added = await api.uploadDeploymentAttachments(deployment.id, fd);
      setAttachments((prev) => [...prev, ...added]);
      toast(`${added.length} file(s) uploaded`, 'success');
    } catch (e) { toast(e.message || 'Upload failed', 'error'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function doDeleteAtt() {
    if (!confirmDeleteAtt) return;
    try {
      await api.deleteDeploymentAttachment(confirmDeleteAtt.id);
      setAttachments((prev) => prev.filter((a) => a.id !== confirmDeleteAtt.id));
      toast('Attachment deleted', 'success');
    } catch (e) { toast(e.message || 'Failed to delete', 'error'); }
    finally { setConfirmDeleteAtt(null); }
  }

  async function handleDeleteAttachment(att) {
    setConfirmDeleteAtt({ id: att.id, name: att.original_name });
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
              {isNew ? 'New Deployment' : 'Edit Deployment'}
            </div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{product.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9CA3AF', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Customer + Environment */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Customer</label>
              <select value={form.customer_id} onChange={(e) => set('customer_id', e.target.value)} style={inp} disabled={!isAdmin}>
                <option value="">— None —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>
                Environment <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <select value={form.environment} onChange={(e) => set('environment', e.target.value)} style={inp} disabled={!isAdmin}>
                {ENVIRONMENTS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>

          {/* Version + Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Version</label>
              <input value={form.version} onChange={(e) => set('version', e.target.value)} placeholder="e.g. 2.4.1" style={inp} disabled={!isAdmin} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} style={inp} disabled={!isAdmin}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Assigned To + Deployed On */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Assigned To</label>
              <select value={form.assigned_to} onChange={(e) => set('assigned_to', e.target.value)} style={inp} disabled={!isAdmin}>
                <option value="">— Unassigned —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Deployed On</label>
              <input type="date" value={form.deployed_at} onChange={(e) => set('deployed_at', e.target.value)} style={inp} disabled={!isAdmin} />
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Notes / Details</label>
            <textarea
              value={form.notes} onChange={(e) => set('notes', e.target.value)}
              placeholder="Release notes, known issues, validation summary…"
              rows={4} style={{ ...inp, resize: 'vertical' }} disabled={!isAdmin}
            />
          </div>

          {/* Attachments (only for existing records) */}
          {!isNew && (
            <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Attachments</div>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, background: '#1E293B', color: '#fff', border: 'none', borderRadius: 6, cursor: uploading ? 'not-allowed' : 'pointer' }}
                    >
                      {uploading ? 'Uploading…' : '+ Add Files'}
                    </button>
                    <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={handleUpload} />
                  </>
                )}
              </div>
              {attachments.length === 0 ? (
                <div style={{ fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' }}>No attachments yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {attachments.map((att) => (
                    <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
                      <span style={{ fontSize: 18 }}>📎</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{att.original_name}</div>
                        <div style={{ fontSize: 11, color: '#9CA3AF' }}>{fileSize(att.size)} · {att.uploaded_by} · {fmt(att.created_at)}</div>
                      </div>
                      <a href={api.deploymentAttachmentDownloadUrl(att.id)} download={att.original_name}
                        style={{ fontSize: 12, color: '#1E293B', textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        Download
                      </a>
                      {isAdmin && (
                        <button onClick={() => handleDeleteAttachment(att)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          {isAdmin && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid #E5E7EB' }}>
              <button onClick={onClose} style={{ padding: '9px 20px', fontSize: 13, fontWeight: 600, border: '1px solid #D1D5DB', borderRadius: 8, background: '#fff', color: '#374151', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '9px 24px', fontSize: 13, fontWeight: 600, background: saving ? '#93C5FD' : '#1E293B', color: '#fff', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving…' : isNew ? 'Create Deployment' : 'Save Changes'}
              </button>
            </div>
          )}
          {!isAdmin && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '9px 20px', fontSize: 13, fontWeight: 600, border: '1px solid #D1D5DB', borderRadius: 8, background: '#fff', color: '#374151', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          )}
        </div>
      </div>
      {confirmDeleteAtt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 10 }}>Delete Attachment?</div>
            <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 24 }}>"{confirmDeleteAtt.name}" will be permanently deleted.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDeleteAtt(null)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 7, cursor: 'pointer' }}>Cancel</button>
              <button onClick={doDeleteAtt} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#DC2626', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ProductTab ────────────────────────────────────────────────────────────────
function ProductTab({ product, customers, users }) {
  const user    = useUser();
  const toast   = useToast();
  const isAdmin = user?.role === 'admin';

  const [deployments, setDeployments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [modal,       setModal]       = useState(null); // null | 'new' | deployment object
  const [deleting,    setDeleting]    = useState(null);
  const [confirmDeleteDeploy, setConfirmDeleteDeploy] = useState(null);
  const [search,      setSearch]      = useState('');
  const [envFilter,   setEnvFilter]   = useState('');
  const [statusFilter,setStatusFilter]= useState('');

  useEffect(() => {
    load();
  }, [product.id]);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getDeployments({ product_id: product.id });
      setDeployments(data);
    } catch (e) { toast(e.message || 'Failed to load deployments', 'error'); }
    finally { setLoading(false); }
  }

  function handleSaved(saved) {
    setDeployments((prev) => {
      const idx = prev.findIndex((d) => d.id === saved.id);
      return idx >= 0 ? prev.map((d) => d.id === saved.id ? saved : d) : [saved, ...prev];
    });
    setModal(null);
  }

  async function doDeleteDeploy() {
    if (!confirmDeleteDeploy) return;
    setDeleting(confirmDeleteDeploy.id);
    try {
      await api.deleteDeployment(confirmDeleteDeploy.id);
      setDeployments((prev) => prev.filter((d) => d.id !== confirmDeleteDeploy.id));
      toast('Deployment deleted', 'success');
    } catch (e) { toast(e.message || 'Failed to delete', 'error'); }
    finally { setDeleting(null); setConfirmDeleteDeploy(null); }
  }

  async function handleDelete(dep) {
    setConfirmDeleteDeploy({ id: dep.id });
  }

  // Filter
  const filtered = deployments.filter((d) => {
    if (envFilter && d.environment !== envFilter) return false;
    if (statusFilter && d.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (d.customer_name || '').toLowerCase().includes(q)
        || (d.version || '').toLowerCase().includes(q)
        || (d.environment || '').toLowerCase().includes(q)
        || (d.assigned_user?.name || '').toLowerCase().includes(q);
    }
    return true;
  });

  if (loading) return <div style={{ padding: 40, color: '#6B7280', fontSize: 14 }}>Loading deployments…</div>;

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer, version…"
          style={{ padding: '7px 12px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none', width: 220 }}
        />
        <select value={envFilter} onChange={(e) => setEnvFilter(e.target.value)}
          style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none', background: '#fff' }}>
          <option value="">All Environments</option>
          {ENVIRONMENTS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none', background: '#fff' }}>
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        {isAdmin && (
          <button
            onClick={() => setModal('new')}
            style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, background: '#1E293B', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            + Add Deployment
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ background: '#F9FAFB', border: '2px dashed #E5E7EB', borderRadius: 12, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🚀</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
            {deployments.length === 0 ? 'No deployments yet' : 'No results match your filters'}
          </div>
          {isAdmin && deployments.length === 0 && (
            <button onClick={() => setModal('new')} style={{ marginTop: 12, padding: '8px 18px', fontSize: 13, fontWeight: 600, background: '#1E293B', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              Add first deployment
            </button>
          )}
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E7EB', background: '#F9FAFB' }}>
                {['Customer', 'Environment', 'Version', 'Status', 'Assigned To', 'Deployed On', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((dep, i) => (
                <tr key={dep.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F3F4F6' : 'none' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#F9FAFB'}
                  onMouseLeave={(e) => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: '#111827' }}>
                    {dep.customer_name || <span style={{ color: '#9CA3AF' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 14px' }}><EnvBadge env={dep.environment} /></td>
                  <td style={{ padding: '12px 14px', color: dep.version ? '#374151' : '#9CA3AF', fontFamily: 'monospace', fontSize: 12 }}>
                    {dep.version || '—'}
                  </td>
                  <td style={{ padding: '12px 14px' }}><StatusBadge status={dep.status} /></td>
                  <td style={{ padding: '12px 14px', color: '#374151' }}>
                    {dep.assigned_user?.name || <span style={{ color: '#9CA3AF' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 14px', color: dep.deployed_at ? '#374151' : '#9CA3AF', whiteSpace: 'nowrap' }}>
                    {fmt(dep.deployed_at)}
                  </td>
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {dep.attachments?.length > 0 && (
                        <span style={{ fontSize: 11, color: '#6B7280', alignSelf: 'center' }}>📎 {dep.attachments.length}</span>
                      )}
                      <button onClick={() => setModal(dep)}
                        style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, border: '1px solid #D1D5DB', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#374151' }}>
                        {isAdmin ? 'Edit' : 'View'}
                      </button>
                      {isAdmin && (
                        <button onClick={() => handleDelete(dep)} disabled={deleting === dep.id}
                          style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, border: '1px solid #FECACA', borderRadius: 6, background: '#FEF2F2', cursor: 'pointer', color: '#DC2626' }}>
                          {deleting === dep.id ? '…' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <DeploymentModal
          deployment={modal === 'new' ? null : modal}
          product={product}
          customers={customers}
          users={users}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
      {confirmDeleteDeploy && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 10 }}>Delete Deployment?</div>
            <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 24 }}>This deployment record will be permanently deleted. This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDeleteDeploy(null)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 7, cursor: 'pointer' }}>Cancel</button>
              <button onClick={doDeleteDeploy} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#DC2626', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ADO Environment status styles ─────────────────────────────────────────────
const ADO_ENV_STATUS_STYLES = {
  succeeded:          { bg: '#F0FDF4', color: '#166534', border: '#A7F3D0', label: 'Succeeded' },
  partiallySucceeded: { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A', label: 'Partial' },
  inProgress:         { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA', label: 'In Progress' },
  queued:             { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', label: 'Queued' },
  scheduled:          { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', label: 'Scheduled' },
  rejected:           { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA', label: 'Rejected' },
  canceled:           { bg: '#F9FAFB', color: '#6B7280', border: '#E5E7EB', label: 'Canceled' },
  notStarted:         { bg: '#F9FAFB', color: '#9CA3AF', border: '#E5E7EB', label: 'Not Started' },
};
function adoEnvStyle(status) {
  return ADO_ENV_STATUS_STYLES[status] || ADO_ENV_STATUS_STYLES.notStarted;
}

const ADO_RELEASE_STATUS_STYLES = {
  active:    { bg: '#F0FDF4', color: '#166534', border: '#A7F3D0' },
  abandoned: { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
};

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── AdoReleasesTab ─────────────────────────────────────────────────────────────
function AdoReleasesTab() {
  const [releases,     setReleases]     = useState([]);
  const [definitions,  setDefinitions]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [projectFilter,setProjectFilter]= useState('');
  const [defFilter,    setDefFilter]    = useState('');
  const [search,       setSearch]       = useState('');
  const [expanded,     setExpanded]     = useState(null); // release id
  const [lastRefreshed,setLastRefreshed]= useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [relData, defData] = await Promise.all([
        api.getDevOpsReleases({ top: 100 }),
        api.getDevOpsReleaseDefinitions(),
      ]);
      setReleases(relData.releases || []);
      setDefinitions(defData.definitions || []);
      setLastRefreshed(new Date());
      if (relData.errors?.length) setError(relData.errors.join('; '));
    } catch (e) {
      setError(e.message || 'Failed to load ADO releases');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Filter
  const filtered = releases.filter((r) => {
    if (projectFilter && r.project !== projectFilter) return false;
    if (defFilter && String(r.definitionId) !== defFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.name || '').toLowerCase().includes(q)
        || (r.definition || '').toLowerCase().includes(q)
        || (r.createdBy  || '').toLowerCase().includes(q)
        || (r.buildVersion || '').toLowerCase().includes(q);
    }
    return true;
  });

  // Unique projects from definitions for filter
  const projectOptions = [...new Set(definitions.map((d) => d.project))].map((p) => {
    const d = definitions.find((x) => x.project === p);
    return { value: p, label: d?.projectLabel || p };
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12, color: '#6B7280', fontSize: 14 }}>
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
          <path d="M29.982 10.302 24.01 2l-12.04 5.378H2.986L0 12.666l16.48 9.956V28l5.822-7.344 7.68 4.626V10.302zM5.34 12.276l5.476-2.844h7.964l-11.44 6.476zm19.316 9.49-5.156-3.104 5.156-9.858v12.962z" fill="#0078D4"/>
        </svg>
        Loading releases from Azure DevOps…
      </div>
    );
  }

  return (
    <div>
      {/* Error banner */}
      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>⚠</span> {error}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search release, pipeline, version…"
          style={{ padding: '7px 12px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none', width: 240 }}
        />
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}
          style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none', background: '#fff' }}>
          <option value="">All Projects</option>
          {projectOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select value={defFilter} onChange={(e) => setDefFilter(e.target.value)}
          style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none', background: '#fff', maxWidth: 200 }}>
          <option value="">All Pipelines</option>
          {definitions.map((d) => (
            <option key={`${d.project}-${d.id}`} value={String(d.id)}>{d.name}</option>
          ))}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: '#F0FDF4', border: '1px solid #A7F3D0', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#166534' }}>
          📌 Retained Indefinitely
        </div>
        <div style={{ flex: 1 }} />
        {lastRefreshed && (
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>
            Fetched live from ADO · {lastRefreshed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
        <button
          onClick={load}
          style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, background: '#F8FAFF', color: '#1E293B', border: '1px solid #C7D2FE', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Count */}
      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 10 }}>
        {filtered.length} release{filtered.length !== 1 ? 's' : ''}{filtered.length !== releases.length ? ` (filtered from ${releases.length})` : ''}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
          No releases found.{releases.length === 0 && ' Make sure your ADO PAT has Release: Read permissions.'}
        </div>
      ) : (
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12 }}>Release</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12 }}>Pipeline</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12 }}>Project</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12 }}>Environments</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12 }}>Build</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12 }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rel, idx) => {
                const relStatus = ADO_RELEASE_STATUS_STYLES[rel.status?.toLowerCase()] || ADO_RELEASE_STATUS_STYLES.active;
                const isExpanded = expanded === rel.id;
                return (
                  <>
                    <tr
                      key={rel.id}
                      onClick={() => setExpanded(isExpanded ? null : rel.id)}
                      style={{ borderBottom: '1px solid #F3F4F6', background: isExpanded ? '#F8FAFF' : idx % 2 === 0 ? '#fff' : '#FAFAFA', cursor: 'pointer' }}
                    >
                      {/* Release name + status */}
                      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: isExpanded ? '#1D4ED8' : '#374151' }}>{isExpanded ? '▾' : '▸'}</span>
                          <div>
                            <div style={{ fontWeight: 600, color: '#1E293B' }}>
                              {rel.webUrl ? (
                                <a href={rel.webUrl} target="_blank" rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ color: '#1E293B', textDecoration: 'none' }}
                                  onMouseEnter={(e) => e.currentTarget.style.color='#1D4ED8'}
                                  onMouseLeave={(e) => e.currentTarget.style.color='#1E293B'}
                                >
                                  {rel.name} ↗
                                </a>
                              ) : rel.name}
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: relStatus.bg, color: relStatus.color, border: `1px solid ${relStatus.border}` }}>
                              {rel.status || 'Active'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Pipeline */}
                      <td style={{ padding: '10px 14px', color: '#374151', verticalAlign: 'middle' }}>
                        {rel.definition || '—'}
                      </td>

                      {/* Project */}
                      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: rel.project === ADO_PROJECT_HINT_PLATFORM ? '#EFF6FF' : '#F5F3FF', color: rel.project === ADO_PROJECT_HINT_PLATFORM ? '#1D4ED8' : '#6D28D9', border: rel.project === ADO_PROJECT_HINT_PLATFORM ? '1px solid #BFDBFE' : '1px solid #DDD6FE' }}>
                          {rel.projectLabel || rel.project}
                        </span>
                      </td>

                      {/* Environments — compact badges */}
                      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {rel.environments.length === 0 ? <span style={{ color: '#9CA3AF' }}>—</span> : rel.environments.map((env) => {
                            const s = adoEnvStyle(env.status);
                            return (
                              <span key={env.id} title={`${env.name}: ${s.label}`} style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>
                                {env.name}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      {/* Build version */}
                      <td style={{ padding: '10px 14px', color: '#374151', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: 12 }}>
                        {rel.buildVersion || '—'}
                        {rel.buildBranch && <div style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'inherit' }}>{rel.buildBranch}</div>}
                      </td>

                      {/* Created */}
                      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                        <div style={{ color: '#374151' }}>{fmt(rel.createdOn)}</div>
                        {rel.createdBy && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{rel.createdBy}</div>}
                      </td>
                    </tr>

                    {/* Expanded row — environment detail */}
                    {isExpanded && (
                      <tr key={`${rel.id}-exp`} style={{ background: '#F8FAFF', borderBottom: '1px solid #E5E7EB' }}>
                        <td colSpan={6} style={{ padding: '0 14px 14px 42px' }}>
                          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8, fontWeight: 600 }}>Environment Details</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                            {rel.environments.map((env) => {
                              const s = adoEnvStyle(env.status);
                              return (
                                <div key={env.id} style={{ padding: '8px 14px', background: '#fff', border: `1px solid ${s.border}`, borderRadius: 8, minWidth: 140 }}>
                                  <div style={{ fontWeight: 700, fontSize: 12, color: '#1E293B', marginBottom: 4 }}>{env.name}</div>
                                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                                    {s.label}
                                  </span>
                                  {env.deployedOn && (
                                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>
                                      {fmtDateTime(env.deployedOn)}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Hint constants used in AdoReleasesTab for project badge colouring
const ADO_PROJECT_HINT_PLATFORM = 'Quality System';

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DeploymentsPage() {
  return <AdoReleasesTab />;
}
