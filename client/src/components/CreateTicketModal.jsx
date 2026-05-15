import { useState, useEffect } from 'react';
import { api, TICKET_TYPES, PRODUCTS, STATUSES, PRIORITIES } from '../api';

export default function CreateTicketModal({ onClose, onCreated, initialData }) {
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
    ...initialData,
  });
  const [groups,    setGroups]    = useState([]);
  const [customers, setCustomers] = useState([]);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  useEffect(() => {
    api.getGroups().then(setGroups).catch(() => {});
    api.getCustomers().then(setCustomers).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

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
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
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
                  <label>Group</label>
                  <select value={form.group_id} onChange={set('group_id')}>
                    <option value="">— Unassigned —</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Customer</label>
                <select value={form.customer_id} onChange={set('customer_id')}>
                  <option value="">— None —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
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
