import { useState, useEffect } from 'react';
import { api, TICKET_TYPES, STATUSES, PRIORITIES } from '../api';
import { useProducts } from '../context/ProductsContext';

export default function CreateTicketModal({ onClose, onCreated, initialData }) {
  const { products: PRODUCTS } = useProducts();
  const [form, setForm] = useState({
    title:           initialData?.title || '',
    description:     initialData?.description || '',
    type:            'Question / How-To',
    requester_email: '',
    product:         '',
    status:          'Open',
    priority:        'Medium',
    customer_id:     '',
    group_id:        '',
    assigned_to:     '',
    ...initialData,
  });
  const [groups,          setGroups]          = useState([]);
  const [customers,       setCustomers]       = useState([]);
  const [allAgents,       setAllAgents]       = useState([]); // full list
  const [filteredAgents,  setFilteredAgents]  = useState([]); // scoped to group
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState('');

  // Load reference data on mount
  useEffect(() => {
    api.getGroups().then(setGroups).catch(() => {});
    api.getCustomers().then(setCustomers).catch(() => {});
    api.getUsers().then((users) => {
      const agents = users.filter((u) => u.role === 'admin' || u.role === 'agent');
      setAllAgents(agents);
      setFilteredAgents(agents); // start with everyone
    }).catch(() => {});
  }, []);

  // Re-scope the Assign To dropdown whenever the group changes
  useEffect(() => {
    if (!form.group_id) {
      setFilteredAgents(allAgents);
      return;
    }
    api.getGroupMembers(Number(form.group_id))
      .then((members) => {
        const memberIds = new Set(members.map((m) => m.id));
        const scoped = allAgents.filter((a) => memberIds.has(a.id));
        setFilteredAgents(scoped);
        // Clear the assignee if they're not in the new group
        setForm((prev) => ({
          ...prev,
          assigned_to: memberIds.has(Number(prev.assigned_to)) ? prev.assigned_to : '',
        }));
      })
      .catch(() => setFilteredAgents(allAgents));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.group_id, allAgents]);

  function setField(k, value) {
    setForm((f) => ({ ...f, [k]: value }));
  }

  const set = (k) => (e) => setField(k, e.target.value);

  async function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    try {
      const ticket = await api.createTicket({
        ...form,
        customer_id: form.customer_id || null,
        group_id:    form.group_id    || null,
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
      });
      onCreated(ticket);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>New Ticket</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <div className="form-grid">
              <div className="form-group">
                <label>Title *</label>
                <input value={form.title} onChange={set('title')} placeholder="Brief description of the issue" autoFocus />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea value={form.description} onChange={set('description')} placeholder="Detailed information about the issue..." />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Ticket Type</label>
                  <select value={form.type} onChange={set('type')}>
                    {TICKET_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Requester Email</label>
                  <input type="email" value={form.requester_email} onChange={set('requester_email')} placeholder="requester@company.com" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Product</label>
                  <select value={form.product} onChange={set('product')}>
                    <option value="">— None —</option>
                    {PRODUCTS.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Priority</label>
                  <select value={form.priority} onChange={set('priority')}>
                    {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.status} onChange={set('status')}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>
                    Assign To
                    {form.group_id && filteredAgents.length === 0 && (
                      <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 6, fontWeight: 400 }}>
                        (no agents in this group)
                      </span>
                    )}
                    {form.group_id && filteredAgents.length > 0 && (
                      <span style={{ fontSize: 11, color: '#6B7280', marginLeft: 6, fontWeight: 400 }}>
                        ({filteredAgents.length} in group)
                      </span>
                    )}
                  </label>
                  <select value={form.assigned_to} onChange={set('assigned_to')}>
                    <option value="">— Unassigned —</option>
                    {filteredAgents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.role})</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Group</label>
                  <select value={form.group_id} onChange={set('group_id')}>
                    <option value="">— Unassigned —</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Customer</label>
                  <select value={form.customer_id} onChange={set('customer_id')}>
                    <option value="">— None —</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            {error && <p style={{ color: '#DC2626', marginTop: 10, fontSize: 13 }}>{error}</p>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
