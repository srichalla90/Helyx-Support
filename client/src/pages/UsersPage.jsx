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
export default function UsersPage() {
  const currentUser = useUser();
  const isAdmin     = currentUser?.role === 'admin';
  const toast       = useToast();

  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [form,    setForm]    = useState({ name: '', email: '', role: 'agent' });
  const [saving,  setSaving]  = useState(false);

  // Inline edit state
  const [editId,   setEditId]   = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'agent' });
  const [editSaving, setEditSaving] = useState(false);

  // Confirm modal state
  const [confirm, setConfirm] = useState(null); // { userId, action: 'deactivate'|'activate' }

  async function load() {
    setLoading(true);
    try { setUsers(await api.getUsers()); }
    catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // ── Create ──────────────────────────────────────────────────────────────────
  async function create(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) { toast('Name and email required', 'error'); return; }
    setSaving(true);
    try {
      const u = await api.createUser(form);
      setUsers((prev) => [...prev, u]);
      setForm({ name: '', email: '', role: 'agent' });
      toast('User created', 'success');
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }

  // ── Edit ────────────────────────────────────────────────────────────────────
  function startEdit(u) {
    setEditId(u.id);
    setEditForm({ name: u.name, email: u.email, role: u.role ?? 'agent' });
  }

  function cancelEdit() { setEditId(null); }

  async function saveEdit(id) {
    if (!editForm.name.trim() || !editForm.email.trim()) { toast('Name and email required', 'error'); return; }
    setEditSaving(true);
    try {
      const updated = await api.updateUser(id, editForm);
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
      setEditId(null);
      toast('User updated', 'success');
    } catch (e) { toast(e.message, 'error'); }
    finally { setEditSaving(false); }
  }

  // ── Activate / Deactivate ───────────────────────────────────────────────────
  function promptStatus(u) {
    setConfirm({ userId: u.id, userName: u.name, action: u.active === 0 ? 'activate' : 'deactivate' });
  }

  async function executeStatus() {
    const { userId, action } = confirm;
    setConfirm(null);
    try {
      const updated = await api.setUserActive(userId, action === 'activate');
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      toast(action === 'activate' ? 'Account activated' : 'Account deactivated', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {confirm && (
        <ConfirmModal
          message={
            confirm.action === 'deactivate'
              ? `Are you sure you want to deactivate ${confirm.userName}'s account? They will no longer be able to log in.`
              : `Reactivate ${confirm.userName}'s account? They will be able to log in again.`
          }
          confirmLabel={confirm.action === 'deactivate' ? 'Deactivate' : 'Activate'}
          confirmStyle={confirm.action === 'deactivate' ? 'danger' : 'primary'}
          onConfirm={executeStatus}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div className="page-header">
        <div>
          <h2>Users</h2>
          <p>Manage agents, admins, and customer portal accounts</p>
        </div>
      </div>

      {isAdmin && (
        <div className="detail-card" style={{ marginBottom: 20 }}>
          <h3>Add New User</h3>
          <form onSubmit={create} style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
            <input
              className="filter-select" style={{ flex: 1, minWidth: 160 }}
              placeholder="Full name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              className="filter-select" style={{ flex: 1, minWidth: 200 }}
              type="email"
              placeholder="Email address"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <select
              className="filter-select" style={{ minWidth: 130 }}
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
              <option value="customer">Customer</option>
            </select>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Adding…' : 'Add User'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : users.length === 0 ? (
        <div className="data-table-wrap">
          <div className="empty-state">
            <div className="empty-icon">🧑</div>
            <h3>No users yet</h3>
            <p>Add users above and assign them to groups.</p>
          </div>
        </div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Email</th>
                <th>Permission</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) =>
                editId === u.id ? (
                  // ── Inline edit row ──────────────────────────────────────
                  <tr key={u.id} style={{ background: '#F0F9FF' }}>
                    <td style={{ color: '#9CA3AF' }}>{u.id}</td>
                    <td>
                      <input
                        className="filter-select" style={{ width: '100%', minWidth: 120 }}
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      />
                    </td>
                    <td>
                      <input
                        className="filter-select" style={{ width: '100%', minWidth: 160 }}
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                      />
                    </td>
                    <td>
                      <select
                        className="filter-select"
                        value={editForm.role}
                        onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                      >
                        <option value="agent">Agent</option>
                        <option value="admin">Admin</option>
                        <option value="customer">Customer</option>
                      </select>
                    </td>
                    <td colSpan={2} />
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ marginRight: 6 }}
                        disabled={editSaving}
                        onClick={() => saveEdit(u.id)}
                      >
                        {editSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
                    </td>
                  </tr>
                ) : (
                  // ── Normal row ───────────────────────────────────────────
                  <tr key={u.id} style={{ opacity: u.active === 0 ? 0.55 : 1 }}>
                    <td style={{ color: '#9CA3AF' }}>{u.id}</td>
                    <td style={{ fontWeight: 500 }}>{u.name}</td>
                    <td style={{ color: '#6B7280' }}>{u.email}</td>
                    <td>
                      <span className={`role-badge role-${u.role ?? 'agent'}`}>
                        {u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1) : 'Agent'}
                      </span>
                    </td>
                    <td>
                      {u.active === 0 ? (
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
                    <td style={{ color: '#6B7280', fontSize: 12 }}>
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {isAdmin ? (
                        <>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ marginRight: 4 }}
                            onClick={() => startEdit(u)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: u.active === 0 ? '#1E293B' : '#DC2626' }}
                            onClick={() => promptStatus(u)}
                          >
                            {u.active === 0 ? 'Activate' : 'Deactivate'}
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
