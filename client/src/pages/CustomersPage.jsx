import { useState, useEffect } from 'react';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { useUser } from '../context/UserContext';

// ── Confirm modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ message, confirmLabel, confirmStyle, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: '28px 32px',
        maxWidth: 400, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
      }}>
        <p style={{ margin: '0 0 24px', fontSize: 15, color: '#111827', lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-sm"
            style={{ background: confirmStyle === 'danger' ? '#DC2626' : '#1E293B', color: '#fff', border: 'none' }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
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

  const [customers,   setCustomers]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [name,        setName]        = useState('');
  const [saving,      setSaving]      = useState(false);

  // Inline edit state
  const [editId,      setEditId]      = useState(null);
  const [editName,    setEditName]    = useState('');
  const [editSaving,  setEditSaving]  = useState(false);

  // Confirm modal state
  const [confirm, setConfirm] = useState(null);

  async function load() {
    setLoading(true);
    try { setCustomers(await api.getCustomers()); }
    catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // ── Create ──────────────────────────────────────────────────────────────────
  async function create(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const c = await api.createCustomer({ name: name.trim() });
      setCustomers((prev) => [...prev, c]);
      setName('');
      toast('Customer added', 'success');
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }

  // ── Edit ────────────────────────────────────────────────────────────────────
  function startEdit(c) {
    setEditId(c.id);
    setEditName(c.name);
  }

  function cancelEdit() { setEditId(null); }

  async function saveEdit(id) {
    if (!editName.trim()) { toast('Name is required', 'error'); return; }
    setEditSaving(true);
    try {
      const updated = await api.updateCustomer(id, { name: editName.trim() });
      setCustomers((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setEditId(null);
      toast('Customer updated', 'success');
    } catch (e) { toast(e.message, 'error'); }
    finally { setEditSaving(false); }
  }

  // ── Activate / Deactivate ───────────────────────────────────────────────────
  function promptStatus(c) {
    setConfirm({ customerId: c.id, customerName: c.name, action: c.active === 0 ? 'activate' : 'deactivate' });
  }

  async function executeStatus() {
    const { customerId, action } = confirm;
    setConfirm(null);
    try {
      const updated = await api.setCustomerActive(customerId, action === 'activate');
      setCustomers((prev) => prev.map((c) => (c.id === customerId ? updated : c)));
      toast(action === 'activate' ? 'Customer activated' : 'Customer deactivated', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {confirm && (
        <ConfirmModal
          message={
            confirm.action === 'deactivate'
              ? `Are you sure you want to deactivate ${confirm.customerName}?`
              : `Reactivate ${confirm.customerName}?`
          }
          confirmLabel={confirm.action === 'deactivate' ? 'Deactivate' : 'Activate'}
          confirmStyle={confirm.action === 'deactivate' ? 'danger' : 'primary'}
          onConfirm={executeStatus}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div className="page-header">
        <div>
          <h2>Customers</h2>
          <p>Manage the list of customers that can be linked to tickets</p>
        </div>
      </div>

      {isAdmin && (
        <div className="detail-card" style={{ marginBottom: 20 }}>
          <h3>Add Customer</h3>
          <form onSubmit={create} style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <input
              className="filter-select" style={{ flex: 1 }}
              placeholder="Customer name (e.g. Acme Corp)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Adding…' : 'Add Customer'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : customers.length === 0 ? (
        <div className="data-table-wrap">
          <div className="empty-state">
            <div className="empty-icon">🏢</div>
            <h3>No customers yet</h3>
            <p>Add customers to link them to support tickets.</p>
          </div>
        </div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Customer Name</th>
                <th>Status</th>
                <th>Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) =>
                editId === c.id ? (
                  // ── Inline edit row ──────────────────────────────────────
                  <tr key={c.id} style={{ background: '#F0F9FF' }}>
                    <td style={{ color: '#9CA3AF' }}>{c.id}</td>
                    <td>
                      <input
                        className="filter-select" style={{ width: '100%', minWidth: 180 }}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                      />
                    </td>
                    <td colSpan={2} />
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ marginRight: 6 }}
                        disabled={editSaving}
                        onClick={() => saveEdit(c.id)}
                      >
                        {editSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
                    </td>
                  </tr>
                ) : (
                  // ── Normal row ───────────────────────────────────────────
                  <tr key={c.id} style={{ opacity: c.active === 0 ? 0.55 : 1 }}>
                    <td style={{ color: '#9CA3AF' }}>{c.id}</td>
                    <td style={{ fontWeight: 500 }}>🏢 {c.name}</td>
                    <td>
                      {c.active === 0 ? (
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 8px',
                          borderRadius: 999, background: '#FEE2E2', color: '#B91C1C',
                        }}>Deactivated</span>
                      ) : (
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 8px',
                          borderRadius: 999, background: '#D1FAE5', color: '#065F46',
                        }}>Active</span>
                      )}
                    </td>
                    <td style={{ color: '#6B7280', fontSize: 12 }}>{new Date(c.created_at).toLocaleDateString()}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {isAdmin ? (
                        <>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ marginRight: 4 }}
                            onClick={() => startEdit(c)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: c.active === 0 ? '#1E293B' : '#DC2626' }}
                            onClick={() => promptStatus(c)}
                          >
                            {c.active === 0 ? 'Activate' : 'Deactivate'}
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
