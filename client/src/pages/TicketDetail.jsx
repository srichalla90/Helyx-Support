import { useState, useEffect } from 'react';
import { api, TICKET_TYPES, PRODUCTS, STATUSES, PRIORITIES } from '../api';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { useUser } from '../context/UserContext';

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function TicketDetail({ ticketId, onBack }) {
  const currentUser = useUser();
  const [ticket,    setTicket]    = useState(null);
  const [groups,    setGroups]    = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [details,   setDetails]   = useState({});
  const [dirty,     setDirty]     = useState(false);
  const [comment,   setComment]   = useState('');
  const [isPublic,  setIsPublic]  = useState(true);
  const [postingCmt,setPostingCmt]= useState(false);
  const [showDelete, setShowDelete]= useState(false);
  const toast = useToast();

  useEffect(() => {
    Promise.all([
      api.getTicket(ticketId),
      api.getGroups(),
      api.getCustomers(),
    ]).then(([t, g, c]) => {
      setTicket(t);
      setGroups(g);
      setCustomers(c);
      setDetails({
        status: t.status, priority: t.priority, type: t.type,
        product: t.product || '', group_id: t.group_id || '',
        customer_id: t.customer_id || '',
        ado_bug_id: t.ado_bug_id || '', deviation_id: t.deviation_id || '',
      });
      setDirty(false);
    }).catch((e) => toast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, [ticketId]);

  function setDetail(field, value) {
    setDetails((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  }

  async function saveDetails() {
    setSaving(true);
    try {
      const updated = await api.updateTicket(ticketId, {
        status:      details.status,
        priority:    details.priority,
        type:        details.type,
        product:     details.product     || null,
        group_id:    details.group_id    || null,
        customer_id: details.customer_id || null,
        ado_bug_id:  details.ado_bug_id  || null,
        deviation_id:details.deviation_id|| null,
      });
      setTicket((prev) => ({ ...prev, ...updated }));
      setDirty(false);
      toast('Details saved', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function postComment() {
    if (!comment.trim()) return;
    setPostingCmt(true);
    try {
      const c = await api.addComment(ticketId, {
        author:      currentUser?.name || 'Agent',
        author_role: currentUser?.role || 'agent',
        body:        comment,
        is_public:   isPublic,
      });
      setTicket((prev) => ({ ...prev, comments: [...(prev.comments || []), c] }));
      setComment('');
      toast(isPublic ? 'Reply sent' : 'Internal note saved', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setPostingCmt(false);
    }
  }

  async function deleteTicket() {
    try {
      await api.deleteTicket(ticketId);
      toast('Ticket deleted', 'success');
      onBack();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  if (loading) return <div className="loading"><div className="spinner" /> Loading…</div>;
  if (!ticket) return <div className="empty-state"><h3>Ticket not found</h3></div>;

  return (
    <div>
      <button className="back-btn" onClick={onBack}>← Back to tickets</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>#{ticket.id} · {ticket.source === 'email' ? '📧 via email' : '✏️ manual'}</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{ticket.title}</h2>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <StatusBadge   status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            {ticket.product && (
              <span style={{ fontSize: 12, color: '#6B7280', background: '#F3F4F6', padding: '2px 8px', borderRadius: 4 }}>
                {ticket.product}
              </span>
            )}
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" style={{ color: '#DC2626' }} onClick={() => setShowDelete(true)}>
          🗑 Delete
        </button>
      </div>

      <div className="ticket-detail-wrap">
        {/* Main */}
        <div className="ticket-detail-main">
          <div className="detail-card">
            <h3>Description</h3>
            <div className="detail-description">{ticket.description || <em style={{ color: '#9CA3AF' }}>No description provided.</em>}</div>
          </div>

          <div className="detail-card">
            <h3>Comments ({(ticket.comments || []).length})</h3>
            <div className="comment-list">
              {(ticket.comments || []).length === 0 && (
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>No comments yet.</p>
              )}
              {(ticket.comments || []).map((c) => {
                const internal = c.is_public === 0;
                return (
                  <div key={c.id} className="comment" style={internal ? {
                    background: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    borderRadius: 8,
                    padding: '10px 14px',
                    marginBottom: 8,
                  } : {}}>
                    <div className="comment-header">
                      <span className="comment-author">{c.author}</span>
                      {internal && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '1px 7px',
                          borderRadius: 999, background: '#FEF3C7', color: '#92400E',
                          marginLeft: 8, textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>Internal Note</span>
                      )}
                      <span className="comment-time">{fmtDateTime(c.created_at)}</span>
                    </div>
                    <div className="comment-body">{c.body}</div>
                  </div>
                );
              })}
            </div>

            {/* ── Comment form ── */}
            <div className="comment-form">
              {/* Public / Internal toggle */}
              <div style={{ display: 'flex', gap: 0, marginBottom: 10, borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E7EB', width: 'fit-content' }}>
                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  style={{
                    padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: 'none', borderRight: '1px solid #E5E7EB',
                    background: isPublic ? '#1E293B' : '#F9FAFB',
                    color:      isPublic ? '#fff'    : '#6B7280',
                  }}
                >
                  📧 Public Reply
                </button>
                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  style={{
                    padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: 'none',
                    background: !isPublic ? '#D97706' : '#F9FAFB',
                    color:      !isPublic ? '#fff'    : '#6B7280',
                  }}
                >
                  🔒 Internal Note
                </button>
              </div>

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={isPublic
                  ? 'Reply to customer — this will be emailed to them…'
                  : 'Internal note — only visible to agents, never emailed…'
                }
                style={!isPublic ? { background: '#FFFBEB', borderColor: '#FDE68A' } : {}}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postComment();
                }}
              />
              <div className="comment-form-footer">
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>⌘+Enter to submit</span>
                <button
                  className="btn btn-sm"
                  style={{
                    background: isPublic ? '#1E293B' : '#D97706',
                    color: '#fff', border: 'none',
                  }}
                  onClick={postComment}
                  disabled={postingCmt || !comment.trim()}
                >
                  {postingCmt ? 'Sending…' : isPublic ? 'Send Reply' : 'Save Note'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar metadata */}
        <div className="ticket-detail-sidebar">
          <div className="detail-card">
            <h3>Details</h3>
            <div className="meta-row">
              <MetaField label="Status" value={details.status || ''} onChange={(v) => setDetail('status', v)}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </MetaField>

              <MetaField label="Priority" value={details.priority || ''} onChange={(v) => setDetail('priority', v)}>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </MetaField>

              <MetaField label="Ticket Type" value={details.type || ''} onChange={(v) => setDetail('type', v)}>
                {TICKET_TYPES.map((t) => <option key={t}>{t}</option>)}
              </MetaField>

              <MetaField label="Product" value={details.product || ''} onChange={(v) => setDetail('product', v)}>
                <option value="">— None —</option>
                {PRODUCTS.map((p) => <option key={p}>{p}</option>)}
              </MetaField>

              <MetaField label="Group" value={details.group_id || ''} onChange={(v) => setDetail('group_id', v)}>
                <option value="">— Unassigned —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </MetaField>

              <MetaField label="Customer" value={details.customer_id || ''} onChange={(v) => setDetail('customer_id', v)}>
                <option value="">— None —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </MetaField>

              <MetaTextField
                label="ADO Bug ID"
                value={details.ado_bug_id || ''}
                onChange={(v) => setDetail('ado_bug_id', v)}
                placeholder="Optional"
              />

              <MetaTextField
                label="Deviation ID"
                value={details.deviation_id || ''}
                onChange={(v) => setDetail('deviation_id', v)}
                placeholder="Optional"
              />
            </div>

            <button
              onClick={saveDetails}
              disabled={saving || !dirty}
              style={{
                marginTop: 14, width: '100%',
                padding: '8px 0', fontSize: 13, fontWeight: 700,
                background: dirty ? '#1E293B' : '#F3F4F6',
                color: dirty ? '#fff' : '#9CA3AF',
                border: 'none', borderRadius: 7,
                cursor: saving || !dirty ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

          <div className="detail-card">
            <h3>Requester</h3>
            <div style={{ fontSize: 13, color: '#374151' }}>
              {ticket.requester_email || <em style={{ color: '#9CA3AF' }}>Unknown</em>}
            </div>
          </div>

          <div className="detail-card">
            <h3>Timeline</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Created</div>
                <div style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>{fmtDateTime(ticket.created_at)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Last Updated</div>
                <div style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>{fmtDateTime(ticket.updated_at)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirm */}
      {showDelete && (
        <div className="modal-overlay" onClick={() => setShowDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Ticket?</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowDelete(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to permanently delete ticket <strong>#{ticket.id}</strong>? This cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDelete(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={deleteTicket}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetaField({ label, value, onChange, children }) {
  return (
    <div className="meta-field">
      <label>{label}</label>
      <select
        className="meta-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </div>
  );
}

function MetaTextField({ label, value, onChange, placeholder }) {
  return (
    <div className="meta-field">
      <label>{label}</label>
      <input
        className="meta-select"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ background: '#fff' }}
      />
    </div>
  );
}
