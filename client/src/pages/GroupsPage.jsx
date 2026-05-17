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
export default function GroupsPage() {
  const user    = useUser();
  const isAdmin = user?.role === 'admin';
  const toast   = useToast();

  const [groups,   setGroups]   = useState([]);
  const [users,    setUsers]    = useState([]);
  const [members,  setMembers]  = useState({});
  const [newName,  setNewName]  = useState('');
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [addingTo, setAddingTo] = useState(null);
  const [addUserId, setAddUserId] = useState('');

  // Inline edit state
  const [editId,    setEditId]    = useState(null);
  const [editName,  setEditName]  = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Confirm modal state
  const [confirm, setConfirm] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [g, u] = await Promise.all([api.getGroups(), api.getUsers()]);
      setGroups(g);
      setUsers(u);
    } catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function loadMembers(groupId) {
    try {
      const m = await api.getGroupMembers(groupId);
      setMembers((prev) => ({ ...prev, [groupId]: m }));
    } catch (e) { toast(e.message, 'error'); }
  }

  function toggleExpand(id) {
    const next = expanded === id ? null : id;
    setExpanded(next);
    if (next !== null) loadMembers(next);
  }

  // ── Create ──────────────────────────────────────────────────────────────────
  async function createGroup(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const g = await api.createGroup({ name: newName.trim() });
      setGroups((prev) => [...prev, { ...g, member_count: 0 }]);
      setNewName('');
      toast('Group created', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  // ── Edit (rename) ───────────────────────────────────────────────────────────
  function startEdit(g) {
    setEditId(g.id);
    setEditName(g.name);
    // Close member panel if open for this group
    if (expanded === g.id) setExpanded(null);
  }

  function cancelEdit() { setEditId(null); }

  async function saveEdit(id) {
    if (!editName.trim()) { toast('Name is required', 'error'); return; }
    setEditSaving(true);
    try {
      const updated = await api.updateGroup(id, { name: editName.trim() });
      setGroups((prev) => prev.map((g) => g.id === id ? { ...g, name: updated.name } : g));
      setEditId(null);
      toast('Group renamed', 'success');
    } catch (e) { toast(e.message, 'error'); }
    finally { setEditSaving(false); }
  }

  // ── Activate / Deactivate ───────────────────────────────────────────────────
  function promptStatus(g) {
    setConfirm({ groupId: g.id, groupName: g.name, action: g.active === 0 ? 'activate' : 'deactivate' });
  }

  async function executeStatus() {
    const { groupId, action } = confirm;
    setConfirm(null);
    try {
      const updated = await api.setGroupActive(groupId, action === 'activate');
      setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, active: updated.active } : g));
      toast(action === 'activate' ? 'Group activated' : 'Group deactivated', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  function promptDelete(g) {
    setConfirm({ groupId: g.id, groupName: g.name, action: 'delete' });
  }

  async function executeDelete(id) {
    try {
      await api.deleteGroup(id);
      setGroups((prev) => prev.filter((g) => g.id !== id));
      toast('Group deleted', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function handleConfirm() {
    if (confirm.action === 'delete') {
      const id = confirm.groupId;
      setConfirm(null);
      await executeDelete(id);
    } else {
      await executeStatus();
    }
  }

  // ── Members ─────────────────────────────────────────────────────────────────
  async function addMember(groupId) {
    if (!addUserId) return;
    try {
      await api.addGroupMember(groupId, Number(addUserId));
      await loadMembers(groupId);
      setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, member_count: g.member_count + 1 } : g));
      setAddUserId('');
      setAddingTo(null);
      toast('Member added', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function removeMember(groupId, userId) {
    try {
      await api.removeGroupMember(groupId, userId);
      setMembers((prev) => ({ ...prev, [groupId]: prev[groupId].filter((u) => u.id !== userId) }));
      setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, member_count: Math.max(0, g.member_count - 1) } : g));
      toast('Member removed', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {confirm && (
        <ConfirmModal
          message={
            confirm.action === 'delete'
              ? `Permanently delete "${confirm.groupName}"? This cannot be undone.`
              : confirm.action === 'deactivate'
              ? `Are you sure you want to deactivate "${confirm.groupName}"?`
              : `Reactivate "${confirm.groupName}"?`
          }
          confirmLabel={confirm.action === 'delete' ? 'Delete' : confirm.action === 'deactivate' ? 'Deactivate' : 'Activate'}
          confirmStyle={confirm.action === 'activate' ? 'primary' : 'danger'}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div className="page-header">
        <div>
          <h2>Groups</h2>
          <p>Organize your support team into groups</p>
        </div>
      </div>

      {isAdmin && (
        <div className="detail-card" style={{ marginBottom: 20 }}>
          <h3>Create New Group</h3>
          <form onSubmit={createGroup} style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <input
              className="filter-select"
              style={{ flex: 1 }}
              placeholder="Group name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-sm">Create</button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Group Name</th>
                <th>Members</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <>
                  {editId === g.id ? (
                    // ── Inline edit row ────────────────────────────────────
                    <tr key={g.id} style={{ background: '#F0F9FF' }}>
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
                          onClick={() => saveEdit(g.id)}
                        >
                          {editSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
                      </td>
                    </tr>
                  ) : (
                    // ── Normal row ─────────────────────────────────────────
                    <tr key={g.id} style={{ opacity: g.active === 0 ? 0.55 : 1 }}>
                      <td style={{ fontWeight: 500 }}>{g.name}</td>
                      <td style={{ color: '#6B7280' }}>{g.member_count} member{g.member_count !== 1 ? 's' : ''}</td>
                      <td>
                        {g.active === 0 ? (
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
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {isAdmin && (
                            <button className="btn btn-ghost btn-sm" onClick={() => startEdit(g)}>
                              Edit
                            </button>
                          )}
                          <button className="btn btn-secondary btn-sm" onClick={() => toggleExpand(g.id)}>
                            {expanded === g.id ? '▲ Collapse' : '▼ Members'}
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                onClick={() => promptStatus(g)}
                                style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer', border: g.active === 0 ? '1px solid #E5E7EB' : '1px solid #BBF7D0', background: g.active === 0 ? '#F3F4F6' : '#F0FDF4', color: g.active === 0 ? '#6B7280' : '#166534' }}
                              >
                                {g.active === 0 ? 'Activate' : 'Deactivate'}
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: '#DC2626' }}
                                onClick={() => promptDelete(g)}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  {expanded === g.id && editId !== g.id && (
                    <tr key={`${g.id}-members`}>
                      <td colSpan={4} style={{ padding: '0 16px 16px', background: '#FAFAFA' }}>
                        <div style={{ paddingTop: 12 }}>
                          {(members[g.id] || []).length === 0 ? (
                            <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 10 }}>No members yet.</p>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                              {(members[g.id] || []).map((u) => (
                                <div key={u.id} style={{
                                  display: 'flex', alignItems: 'center', gap: 6,
                                  background: '#EFF6FF', borderRadius: 20, padding: '4px 12px',
                                  fontSize: 13, color: '#1D4ED8',
                                }}>
                                  🧑 {u.name}
                                  {isAdmin && (
                                    <button
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93C5FD', fontSize: 14, lineHeight: 1 }}
                                      onClick={() => removeMember(g.id, u.id)}
                                    >×</button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {isAdmin && (
                            addingTo === g.id ? (
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <select
                                  className="filter-select"
                                  value={addUserId}
                                  onChange={(e) => setAddUserId(e.target.value)}
                                >
                                  <option value="">Select user…</option>
                                  {users
                                    .filter((u) => !(members[g.id] || []).some((m) => m.id === u.id))
                                    .map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)
                                  }
                                </select>
                                <button className="btn btn-primary btn-sm" onClick={() => addMember(g.id)}>Add</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setAddingTo(null)}>Cancel</button>
                              </div>
                            ) : (
                              <button className="btn btn-secondary btn-sm" onClick={() => { setAddingTo(g.id); setAddUserId(''); }}>
                                + Add Member
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
