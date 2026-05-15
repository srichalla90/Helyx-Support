import { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { api, TICKET_TYPES, PRODUCTS, STATUSES, PRIORITIES } from '../api';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { useUser } from '../context/UserContext';

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtBytes(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1024/1024).toFixed(1)} MB`;
}
function fmtHours(h) {
  if (h === null || h === undefined) return '—';
  const abs = Math.abs(h);
  if (abs < 1) return `${Math.round(abs * 60)}m`;
  if (abs < 48) return `${abs.toFixed(1)}h`;
  return `${(abs / 24).toFixed(1)}d`;
}

// ── Activity feed ─────────────────────────────────────────────────────────────
const ACTION_ICONS = {
  created: '🎫', status_changed: '🔄', priority_changed: '⚡', type_changed: '🏷️',
  product_changed: '📦', assigned: '👤', unassigned: '👤', replied: '💬',
  internal_note: '🔒', attachment_added: '📎', automation_rule: '⚡', merged: '🔀',
};
function actionLabel(entry) {
  switch (entry.action) {
    case 'created':          return `Ticket created with status ${entry.new_value}`;
    case 'status_changed':   return `Status changed from ${entry.old_value} → ${entry.new_value}`;
    case 'priority_changed': return `Priority changed from ${entry.old_value} → ${entry.new_value}`;
    case 'type_changed':     return `Type changed to ${entry.new_value}`;
    case 'product_changed':  return `Product changed to ${entry.new_value || 'None'}`;
    case 'assigned':         return `Assigned to ${entry.new_value}`;
    case 'unassigned':       return `Unassigned from ${entry.old_value}`;
    case 'replied':          return `Replied to customer`;
    case 'internal_note':    return `Added internal note`;
    case 'attachment_added': return `Attached ${entry.new_value}`;
    case 'automation_rule':  return `Automation: set ${entry.field?.replace('set_', '')} → ${entry.new_value}`;
    case 'merged':           return entry.new_value || 'Tickets merged';
    default: return entry.action;
  }
}

function ActivityFeed({ ticketId, refreshKey }) {
  const [log, setLog] = useState([]);
  useEffect(() => {
    api.getTicketActivity(ticketId).then(setLog).catch(() => {});
  }, [ticketId, refreshKey]);
  if (!log.length) return <p style={{ color: '#9CA3AF', fontSize: 13 }}>No activity recorded yet.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {log.map((entry, i) => (
        <div key={entry.id} style={{ display: 'flex', gap: 10, paddingBottom: 12, position: 'relative' }}>
          {i < log.length - 1 && (
            <div style={{ position: 'absolute', left: 15, top: 28, bottom: 0, width: 1, background: '#E5E7EB' }} />
          )}
          <div style={{
            width: 30, height: 30, borderRadius: '50%', background: '#F3F4F6',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, flexShrink: 0, zIndex: 1,
          }}>
            {ACTION_ICONS[entry.action] || '📝'}
          </div>
          <div style={{ paddingTop: 4, flex: 1 }}>
            <span style={{ fontSize: 13, color: '#374151' }}>
              <strong>{entry.actor}</strong> — {actionLabel(entry)}
            </span>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{fmtDateTime(entry.created_at)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Customer history modal ────────────────────────────────────────────────────
function CustomerHistoryModal({ email, currentTicketId, onClose, onSelectTicket }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.getTicketsByEmail(email).then(setTickets).catch(() => {}).finally(() => setLoading(false));
  }, [email]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Ticket History — {email}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: 400, overflowY: 'auto' }}>
          {loading ? <p>Loading…</p> : tickets.length === 0 ? <p style={{ color: '#9CA3AF' }}>No other tickets found.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6B7280', fontWeight: 600 }}>#</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6B7280', fontWeight: 600 }}>Title</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6B7280', fontWeight: 600 }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6B7280', fontWeight: 600 }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => { if (t.id !== currentTicketId) { onSelectTicket(t.id); onClose(); } }}
                    style={{ borderBottom: '1px solid #F3F4F6', cursor: t.id !== currentTicketId ? 'pointer' : 'default', background: t.id === currentTicketId ? '#F9FAFB' : undefined }}
                    onMouseEnter={(e) => { if (t.id !== currentTicketId) e.currentTarget.style.background = '#EFF6FF'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = t.id === currentTicketId ? '#F9FAFB' : ''; }}
                  >
                    <td style={{ padding: '8px 8px', color: '#9CA3AF' }}>#{t.id}{t.id === currentTicketId ? ' (current)' : ''}</td>
                    <td style={{ padding: '8px 8px', color: '#111827', fontWeight: 500 }}>{t.title}</td>
                    <td style={{ padding: '8px 8px' }}><StatusBadge status={t.status} /></td>
                    <td style={{ padding: '8px 8px', color: '#6B7280' }}>{fmtDate(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Attachment list ───────────────────────────────────────────────────────────
function AttachmentList({ attachments, onDelete }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
      {attachments.map((att) => (
        <div key={att.id} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 8,
          padding: '6px 10px', fontSize: 12,
        }}>
          <span>📎</span>
          <a
            href={api.ticketAttachmentDownloadUrl(att.id)}
            target="_blank" rel="noreferrer"
            style={{ color: '#2563EB', textDecoration: 'none', fontWeight: 500 }}
          >
            {att.original_name || att.display_name}
          </a>
          <span style={{ color: '#9CA3AF' }}>{fmtBytes(att.size)}</span>
          {onDelete && (
            <button
              onClick={() => onDelete(att.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 13, padding: '0 2px' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#DC2626'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#9CA3AF'}
            >✕</button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Canned Responses Picker ───────────────────────────────────────────────────
function CannedResponsePicker({ onSelect, onClose }) {
  const [responses, setResponses] = useState([]);
  const [search,    setSearch]    = useState('');
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    api.getCannedResponses()
      .then(setResponses)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = responses.filter((r) =>
    !search || r.title.toLowerCase().includes(search.toLowerCase()) ||
    r.body.toLowerCase().includes(search.toLowerCase())
  );
  const byCategory = filtered.reduce((acc, r) => {
    (acc[r.category] = acc[r.category] || []).push(r);
    return acc;
  }, {});

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📋 Canned Responses</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #F3F4F6' }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search responses…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #E5E7EB', borderRadius: 7, fontSize: 13, outline: 'none' }}
            />
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto', padding: '8px 0' }}>
            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Loading…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
                {responses.length === 0 ? 'No canned responses yet. Add some in Settings → Canned Responses.' : 'No matches found.'}
              </div>
            ) : (
              Object.entries(byCategory).map(([category, items]) => (
                <div key={category}>
                  <div style={{ padding: '6px 16px 4px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{category}</div>
                  {items.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => { onSelect(r.body); onClose(); }}
                      style={{
                        width: '100%', textAlign: 'left', padding: '10px 16px',
                        background: 'none', border: 'none', cursor: 'pointer',
                        borderBottom: '1px solid #F9FAFB',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#EFF6FF'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{r.title}</div>
                      <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(r.body.replace(/<[^>]+>/g, ' ').slice(0, 80)) }}
                      />
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SLA Status Badge ──────────────────────────────────────────────────────────
function SLABadge({ sla }) {
  if (!sla || !sla.policy) return null;
  const { first_response_breached, resolution_breached, first_response_remaining_hours, resolution_remaining_hours, is_resolved } = sla;
  if (is_resolved) return (
    <span style={{ fontSize: 11, background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0', borderRadius: 999, padding: '2px 10px', fontWeight: 600 }}>
      ✓ SLA Met
    </span>
  );
  const overdue = first_response_breached || resolution_breached;
  const bg = overdue ? '#FEF2F2' : '#FFF7ED';
  const color = overdue ? '#991B1B' : '#92400E';
  const border = overdue ? '#FECACA' : '#FED7AA';
  return (
    <span title={`First response: ${first_response_breached ? 'OVERDUE' : fmtHours(first_response_remaining_hours) + ' left'} | Resolution: ${resolution_breached ? 'OVERDUE' : fmtHours(resolution_remaining_hours) + ' left'}`}
      style={{ fontSize: 11, background: bg, color, border: `1px solid ${border}`, borderRadius: 999, padding: '2px 10px', fontWeight: 600, cursor: 'default' }}>
      {overdue ? '⚠ SLA Breached' : `⏱ ${fmtHours(Math.min(first_response_remaining_hours ?? Infinity, resolution_remaining_hours ?? Infinity))} to SLA`}
    </span>
  );
}

// ── Tag Chips ─────────────────────────────────────────────────────────────────
function TagsSection({ ticketId }) {
  const [tags,     setTags]     = useState([]);
  const [adding,   setAdding]   = useState(false);
  const [newTag,   setNewTag]   = useState('');
  const [saving,   setSaving]   = useState(false);
  const inputRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    setTags([]);
    api.getTicketTags(ticketId).then(setTags).catch(() => {});
  }, [ticketId]);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  async function addTag() {
    const tag = newTag.trim().toLowerCase();
    if (!tag) { setAdding(false); setNewTag(''); return; }
    if (tags.includes(tag)) { setNewTag(''); return; }
    setSaving(true);
    try {
      const updated = await api.addTicketTag(ticketId, tag);
      setTags(updated);
      setNewTag('');
      setAdding(false);
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }

  async function removeTag(tag) {
    try {
      const updated = await api.removeTicketTag(ticketId, tag);
      setTags(updated);
    } catch (e) { toast(e.message, 'error'); }
  }

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Tags</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {tags.map((tag) => (
          <span key={tag} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500 }}>
            {tag}
            <button onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93C5FD', fontSize: 11, padding: 0, lineHeight: 1 }}>✕</button>
          </span>
        ))}
        {adding ? (
          <input
            ref={inputRef}
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') { setAdding(false); setNewTag(''); } }}
            onBlur={addTag}
            disabled={saving}
            placeholder="tag name…"
            style={{ padding: '2px 8px', fontSize: 12, border: '1px solid #BFDBFE', borderRadius: 999, outline: 'none', width: 80, color: '#1D4ED8' }}
          />
        ) : (
          <button onClick={() => setAdding(true)} style={{ background: 'none', border: '1px dashed #D1D5DB', borderRadius: 999, padding: '2px 10px', fontSize: 12, color: '#9CA3AF', cursor: 'pointer' }}>
            + Add tag
          </button>
        )}
      </div>
    </div>
  );
}

// ── Rich text toolbar ─────────────────────────────────────────────────────────
function RichToolbar({ editorRef, onCannedResponse }) {
  function exec(cmd, val = null) { editorRef.current?.focus(); document.execCommand(cmd, false, val); }
  const btn = (title, onClick, children) => (
    <button
      key={title} title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      style={{ padding: '3px 7px', fontSize: 12, border: '1px solid #E5E7EB', borderRadius: 4, cursor: 'pointer', background: '#fff', color: '#374151' }}
    >{children}</button>
  );
  return (
    <div style={{ display: 'flex', gap: 4, padding: '6px 10px', background: '#F9FAFB', borderBottom: '1px solid #F3F4F6', flexWrap: 'wrap', alignItems: 'center' }}>
      {btn('Bold',      () => exec('bold'),      <strong>B</strong>)}
      {btn('Italic',    () => exec('italic'),    <em>I</em>)}
      {btn('Underline', () => exec('underline'), <u>U</u>)}
      <div style={{ width: 1, height: 18, background: '#E5E7EB', margin: '0 2px', alignSelf: 'center' }} />
      {btn('Bullet list',   () => exec('insertUnorderedList'), '• List')}
      {btn('Numbered list', () => exec('insertOrderedList'),   '1. List')}
      <div style={{ width: 1, height: 18, background: '#E5E7EB', margin: '0 2px', alignSelf: 'center' }} />
      <button
        title="Insert canned response"
        onMouseDown={(e) => { e.preventDefault(); onCannedResponse(); }}
        style={{ padding: '3px 9px', fontSize: 12, border: '1px solid #E5E7EB', borderRadius: 4, cursor: 'pointer', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 600 }}
      >📋 Canned</button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function TicketDetail({ ticketId, onBack, onSelectTicket }) {
  const currentUser = useUser();
  const editorRef   = useRef(null);

  const [ticket,      setTicket]      = useState(null);
  const [groups,      setGroups]      = useState([]);
  const [customers,   setCustomers]   = useState([]);
  const [allAgents,       setAllAgents]       = useState([]);
  const [filteredAgents,  setFilteredAgents]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [details,     setDetails]     = useState({});
  const [dirty,       setDirty]       = useState(false);
  const [isPublic,    setIsPublic]    = useState(true);
  const [postingCmt,  setPostingCmt]  = useState(false);
  const [showDelete,    setShowDelete]    = useState(false);
  const [showMerge,     setShowMerge]     = useState(false);
  const [mergeSearch,   setMergeSearch]   = useState('');
  const [mergeResults,  setMergeResults]  = useState([]);
  const [mergeTarget,   setMergeTarget]   = useState(null); // the source to merge in
  const [merging,       setMerging]       = useState(false);
  const [showHistory,   setShowHistory]   = useState(false);
  const [showCanned,    setShowCanned]    = useState(false);
  const [pendingFiles,  setPendingFiles]  = useState([]);
  const [activityKey,   setActivityKey]   = useState(0);
  const [slaStatus,     setSlaStatus]     = useState(null);
  const [csatRating,    setCsatRating]    = useState(null);
  const [sendingCsat,   setSendingCsat]   = useState(false);
  const [customFields,  setCustomFields]  = useState({ definitions: [], values: {} });
  const [customDirty,   setCustomDirty]   = useState(false);
  const [savingCustom,  setSavingCustom]  = useState(false);
  const [mentionQuery,  setMentionQuery]  = useState('');
  const [showMention,   setShowMention]   = useState(false);
  const [mentionIdx,    setMentionIdx]    = useState(0);
  const fileInputRef      = useRef(null);
  const mentionAnchor     = useRef(null); // stores caret position when @ was typed
  const mentionDropdownRef = useRef(null); // ref to the dropdown DOM node
  const toast = useToast();

  useEffect(() => {
    setLoading(true);
    setTicket(null);
    setDirty(false);
    setCustomDirty(false);
    setShowDelete(false);
    setShowMerge(false);
    setMergeSearch('');
    setMergeResults([]);
    setMergeTarget(null);
    setMerging(false);
    setPendingFiles([]);
    setShowMention(false);
    setSlaStatus(null);
    setCsatRating(null);
    setCustomFields({ definitions: [], values: {} });
    if (editorRef.current) editorRef.current.innerHTML = '';
    Promise.all([
      api.getTicket(ticketId),
      api.getGroups(),
      api.getCustomers(),
      api.getUsers(),
    ]).then(([t, g, c, u]) => {
      setTicket(t);
      setGroups(g);
      setCustomers(c);
      const agentList = u.filter((usr) => usr.role === 'admin' || usr.role === 'agent');
      setAllAgents(agentList);
      setFilteredAgents(agentList);
      setDetails({
        status:      t.status,
        priority:    t.priority,
        type:        t.type,
        product:     t.product     || '',
        group_id:    t.group_id    || '',
        customer_id: t.customer_id || '',
        assigned_to: t.assigned_to || '',
      });
      setDirty(false);
    }).catch((e) => toast(e.message, 'error'))
      .finally(() => setLoading(false));

    // Load SLA status, CSAT rating, and custom fields in parallel (non-blocking)
    api.getTicketSLA(ticketId).then(setSlaStatus).catch(() => {});
    api.getCsatForTicket(ticketId).then(setCsatRating).catch(() => {});
    api.getTicketCustomFields(ticketId).then(setCustomFields).catch(() => {});
  }, [ticketId]);

  // Re-scope the Assigned To dropdown whenever the group selection changes
  useEffect(() => {
    if (!details.group_id) {
      setFilteredAgents(allAgents);
      return;
    }
    api.getGroupMembers(Number(details.group_id))
      .then((members) => {
        const memberIds = new Set(members.map((m) => m.id));
        setFilteredAgents(allAgents.filter((a) => memberIds.has(a.id)));
      })
      .catch(() => setFilteredAgents(allAgents));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details.group_id, allAgents]);

  // Dismiss @mention dropdown when clicking outside of it
  useEffect(() => {
    if (!showMention) return;
    function handleOutsideClick(e) {
      if (mentionDropdownRef.current && !mentionDropdownRef.current.contains(e.target)) {
        setShowMention(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showMention]);

  function setDetail(field, value) {
    setDetails((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  }

  async function saveDetails() {
    setSaving(true);
    try {
      const updated = await api.updateTicket(ticketId, {
        status:       details.status,
        priority:     details.priority,
        type:         details.type,
        product:      details.product      || null,
        group_id:     details.group_id     || null,
        customer_id:  details.customer_id  || null,
        assigned_to:  details.assigned_to !== '' ? Number(details.assigned_to) : null,
        actor:        currentUser?.name || 'Agent',
      });
      setTicket((prev) => ({ ...prev, ...updated }));
      setDetails((prev) => ({ ...prev, assigned_to: updated.assigned_to || '' }));
      setDirty(false);
      setActivityKey((k) => k + 1);
      // Refresh SLA after status/priority change
      api.getTicketSLA(ticketId).then(setSlaStatus).catch(() => {});
      toast('Details saved', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveCustomFields() {
    setSavingCustom(true);
    try {
      const updated = await api.saveTicketCustomFields(ticketId, customFields.values);
      setCustomFields(updated);
      setCustomDirty(false);
      toast('Custom fields saved', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSavingCustom(false);
    }
  }

  function setCustomValue(fieldId, value) {
    setCustomFields((prev) => ({ ...prev, values: { ...prev.values, [fieldId]: value } }));
    setCustomDirty(true);
  }

  // Build filtered mention suggestions from allAgents
  const mentionSuggestions = allAgents.filter((a) =>
    mentionQuery === '' || a.name.toLowerCase().includes(mentionQuery.toLowerCase())
  ).slice(0, 8);

  function insertMention(agent) {
    // Remove the typed @query from the editor, then insert the mention span
    const editor = editorRef.current;
    if (!editor) return;
    const sel = window.getSelection();
    if (!sel || !mentionAnchor.current) return;

    // Find @query text and delete it, then insert span
    const range = sel.getRangeAt(0);
    const preCaretRange = document.createRange();
    preCaretRange.selectNodeContents(editor);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    const textBefore = preCaretRange.toString();
    const atIndex = textBefore.lastIndexOf('@');
    if (atIndex === -1) {
      setShowMention(false);
      return;
    }
    const queryLen = textBefore.length - atIndex; // includes '@'
    // Walk back in the DOM to delete queryLen chars
    try {
      const delRange = range.cloneRange();
      delRange.setStart(range.endContainer, range.endOffset - queryLen);
      delRange.deleteContents();
    } catch (_) { /* ignore */ }

    // Insert the mention span
    const span = document.createElement('span');
    span.className = 'mention';
    span.setAttribute('data-user-id', agent.id);
    span.setAttribute('contenteditable', 'false');
    span.style.cssText = 'color:#2563EB;background:#EFF6FF;border-radius:4px;padding:1px 4px;font-weight:600;cursor:default;';
    span.textContent = `@${agent.name}`;
    const afterSpace = document.createTextNode(' '); // non-breaking space after mention
    const newSel = window.getSelection();
    if (newSel && newSel.rangeCount > 0) {
      const r = newSel.getRangeAt(0);
      r.insertNode(afterSpace);
      r.insertNode(span);
      // Move cursor after the space
      r.setStartAfter(afterSpace);
      r.setEndAfter(afterSpace);
      newSel.removeAllRanges();
      newSel.addRange(r);
    }
    setShowMention(false);
    setMentionQuery('');
    editor.focus();
  }

  function handleEditorInput() {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const preCaretRange = document.createRange();
    preCaretRange.selectNodeContents(editor);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    const textBefore = preCaretRange.toString();
    const atIndex = textBefore.lastIndexOf('@');
    if (atIndex === -1) {
      setShowMention(false);
      return;
    }
    const queryAfterAt = textBefore.slice(atIndex + 1);
    // If the query contains a space, we've typed past the mention
    if (queryAfterAt.includes(' ')) {
      setShowMention(false);
      return;
    }
    mentionAnchor.current = range.cloneRange();
    setMentionQuery(queryAfterAt);
    setShowMention(true);
    setMentionIdx(0);
  }

  function handleEditorKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!postingCmt) postComment();
      return;
    }
    if (showMention) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIdx((i) => Math.min(i + 1, mentionSuggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (mentionSuggestions[mentionIdx]) insertMention(mentionSuggestions[mentionIdx]);
      } else if (e.key === 'Escape') {
        setShowMention(false);
      }
    }
  }

  async function searchMergeTickets(q) {
    setMergeSearch(q);
    if (!q.trim()) { setMergeResults([]); return; }
    try {
      const results = await api.getTickets({ search: q });
      setMergeResults((Array.isArray(results) ? results : (results.tickets || [])).filter((t) => t.id !== ticketId).slice(0, 8));
    } catch (e) { /* ignore */ }
  }

  async function executeMerge() {
    if (!mergeTarget) return;
    if (!window.confirm(`Merge ticket #${mergeTarget.id} ("${mergeTarget.title}") into this ticket? The merged ticket will be closed.`)) return;
    setMerging(true);
    try {
      const updated = await api.mergeTicket(ticketId, mergeTarget.id);
      setTicket(updated);
      setShowMerge(false);
      setMergeTarget(null);
      setMergeSearch('');
      setMergeResults([]);
      setActivityKey((k) => k + 1);
      toast(`Ticket #${mergeTarget.id} merged successfully`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setMerging(false);
    }
  }

  function insertCannedResponse(html) {
    if (editorRef.current) {
      editorRef.current.focus();
      document.execCommand('insertHTML', false, html);
    }
  }

  async function postComment() {
    const body = editorRef.current?.innerHTML?.trim() || '';
    if (!body || body === '<br>' || body === '<div><br></div>') return;
    setPostingCmt(true);
    try {
      const c = await api.addComment(ticketId, {
        author:      currentUser?.name || 'Agent',
        author_role: currentUser?.role || 'agent',
        body,
        is_public:   isPublic,
      });

      let newAttachments = [];
      if (pendingFiles.length > 0) {
        const fd = new FormData();
        for (const f of pendingFiles) fd.append('files', f);
        fd.append('uploaded_by', currentUser?.name || 'Agent');
        fd.append('comment_id', c.id);
        newAttachments = await api.uploadTicketAttachments(ticketId, fd);
        setPendingFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }

      setTicket((prev) => ({
        ...prev,
        comments:    [...(prev.comments || []), c],
        attachments: [...(prev.attachments || []), ...newAttachments],
      }));
      setActivityKey((k) => k + 1);
      if (editorRef.current) editorRef.current.innerHTML = '';
      toast(isPublic ? 'Reply sent' : 'Internal note saved', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setPostingCmt(false);
    }
  }

  async function deleteAttachment(attId) {
    try {
      await api.deleteTicketAttachment(attId);
      setTicket((prev) => ({ ...prev, attachments: prev.attachments.filter((a) => a.id !== attId) }));
      toast('Attachment removed', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function deleteTicket() {
    try {
      await api.deleteTicket(ticketId);
      toast('Ticket deleted', 'success');
      onBack();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function sendCsatSurvey() {
    setSendingCsat(true);
    try {
      await api.sendCsatSurvey(ticketId);
      const updated = await api.getCsatForTicket(ticketId);
      setCsatRating(updated);
      toast('CSAT survey sent!', 'success');
    } catch (e) {
      toast(e.message || 'Failed to send survey', 'error');
    } finally {
      setSendingCsat(false);
    }
  }

  if (loading) return <div className="loading"><div className="spinner" /> Loading…</div>;
  if (!ticket) return <div className="empty-state"><h3>Ticket not found</h3></div>;

  const isResolved = ['Resolved', 'Closed'].includes(ticket.status);

  return (
    <div>
      <button className="back-btn" onClick={onBack}>← Back to tickets</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>
            #{ticket.id} · {ticket.source === 'email' ? '📧 via email' : '✏️ manual'}
            {ticket.assigned_user_name && (
              <span style={{ marginLeft: 10, color: '#6B7280' }}>👤 {ticket.assigned_user_name}</span>
            )}
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{ticket.title}</h2>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            {ticket.product && (
              <span style={{ fontSize: 12, color: '#6B7280', background: '#F3F4F6', padding: '2px 8px', borderRadius: 4 }}>
                {ticket.product}
              </span>
            )}
            <SLABadge sla={slaStatus} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(currentUser?.role === 'admin' || currentUser?.role === 'agent') && (
            <button className="btn btn-secondary btn-sm" style={{ color: '#7C3AED' }} onClick={() => setShowMerge(true)}>
              🔀 Merge
            </button>
          )}
          {currentUser?.role === 'admin' && (
            <button className="btn btn-secondary btn-sm" style={{ color: '#DC2626' }} onClick={() => setShowDelete(true)}>
              🗑 Delete
            </button>
          )}
        </div>
      </div>

      <div className="ticket-detail-wrap">
        {/* ── Main column ─────────────────────────────────────────────────── */}
        <div className="ticket-detail-main">
          {/* Description */}
          <div className="detail-card">
            <h3>Description</h3>
            <div className="detail-description">
              {ticket.description || <em style={{ color: '#9CA3AF' }}>No description provided.</em>}
            </div>
            <AttachmentList attachments={ticket.attachments} onDelete={deleteAttachment} />
          </div>

          {/* Activity log */}
          <div className="detail-card">
            <h3>Activity</h3>
            <ActivityFeed ticketId={ticketId} refreshKey={activityKey} />
          </div>

          {/* Comments */}
          <div className="detail-card">
            <h3>Conversation ({(ticket.comments || []).length})</h3>
            <div className="comment-list">
              {(ticket.comments || []).length === 0 && (
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>No messages yet.</p>
              )}
              {(ticket.comments || []).map((c) => {
                const internal = c.is_public === 0;
                return (
                  <div key={c.id} className="comment" style={internal ? {
                    background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', marginBottom: 8,
                  } : {}}>
                    <div className="comment-header">
                      <span className="comment-author">{c.author}</span>
                      {internal && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
                          background: '#FEF3C7', color: '#92400E', marginLeft: 8,
                          textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>Internal Note</span>
                      )}
                      <span className="comment-time">{fmtDateTime(c.created_at)}</span>
                    </div>
                    <div className="comment-body" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(c.body) }} />
                  </div>
                );
              })}
            </div>

            {/* Comment form */}
            <div className="comment-form" style={{ padding: 0 }}>
              {/* Toggle */}
              <div style={{ display: 'flex', gap: 0, marginBottom: 10, borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E7EB', width: 'fit-content' }}>
                <button type="button" onClick={() => setIsPublic(true)} style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', borderRight: '1px solid #E5E7EB', background: isPublic ? '#1E293B' : '#F9FAFB', color: isPublic ? '#fff' : '#6B7280' }}>
                  📧 Public Reply
                </button>
                <button type="button" onClick={() => setIsPublic(false)} style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: !isPublic ? '#D97706' : '#F9FAFB', color: !isPublic ? '#fff' : '#6B7280' }}>
                  🔒 Internal Note
                </button>
              </div>

              {/* Rich text editor */}
              <div style={{
                border: `1px solid ${!isPublic ? '#FDE68A' : '#E5E7EB'}`,
                borderRadius: 8, overflow: 'hidden',
                background: !isPublic ? '#FFFBEB' : '#fff',
                marginBottom: 10,
              }}>
                <RichToolbar editorRef={editorRef} onCannedResponse={() => setShowCanned(true)} />
                <div style={{ position: 'relative' }}>
                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    data-placeholder={isPublic ? 'Reply to customer — will be emailed… (Type @ to mention an agent)' : 'Internal note — only visible to agents… (Type @ to mention an agent)'}
                    onKeyDown={handleEditorKeyDown}
                    onInput={handleEditorInput}
                    style={{
                      minHeight: 100, padding: '12px 14px',
                      fontSize: 14, color: '#111827', outline: 'none',
                      lineHeight: 1.6,
                    }}
                  />
                  {/* @mention dropdown */}
                  {showMention && (
                    <div
                      ref={mentionDropdownRef}
                      style={{
                        position: 'absolute', top: 'calc(100% + 2px)', left: 8, zIndex: 200,
                        background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.10)', minWidth: 280, maxWidth: 360,
                        overflow: 'hidden',
                      }}
                    >
                      {/* Header */}
                      <div style={{
                        padding: '7px 12px', fontSize: 11, fontWeight: 700, color: '#6B7280',
                        textTransform: 'uppercase', letterSpacing: '0.6px',
                        borderBottom: '1px solid #F3F4F6', background: '#FAFAFA',
                      }}>
                        Tag an agent
                      </div>

                      {/* Results */}
                      {mentionSuggestions.length === 0 ? (
                        <div style={{ padding: '14px 12px', fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
                          No agents found
                        </div>
                      ) : mentionSuggestions.map((agent, i) => {
                        const avatarColors = [
                          ['#DBEAFE','#1D4ED8'], ['#D1FAE5','#065F46'], ['#FEE2E2','#991B1B'],
                          ['#FEF3C7','#92400E'], ['#EDE9FE','#5B21B6'], ['#FCE7F3','#9D174D'],
                        ];
                        const [avatarBg, avatarFg] = avatarColors[(agent.name?.charCodeAt(0) || 0) % avatarColors.length];
                        const isSelected = i === mentionIdx;
                        return (
                          <div
                            key={agent.id}
                            onMouseDown={(e) => { e.preventDefault(); insertMention(agent); }}
                            onMouseEnter={() => setMentionIdx(i)}
                            style={{
                              padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                              background: isSelected ? '#EFF6FF' : '#fff',
                              borderLeft: isSelected ? '3px solid #3B82F6' : '3px solid transparent',
                              transition: 'background 0.1s',
                            }}
                          >
                            {/* Avatar */}
                            <div style={{
                              width: 32, height: 32, borderRadius: '50%', background: avatarBg,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 13, fontWeight: 700, color: avatarFg, flexShrink: 0,
                            }}>
                              {agent.name?.[0]?.toUpperCase() || '?'}
                            </div>
                            {/* Name + email */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, color: '#111827', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {agent.name}
                              </div>
                              {agent.email && (
                                <div style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {agent.email}
                                </div>
                              )}
                            </div>
                            {/* Role badge */}
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                              background: agent.role === 'admin' ? '#FEF3C7' : '#E0E7FF',
                              color:      agent.role === 'admin' ? '#92400E'  : '#3730A3',
                              textTransform: 'capitalize', flexShrink: 0,
                            }}>
                              {agent.role}
                            </span>
                          </div>
                        );
                      })}

                      {/* Footer hint */}
                      {mentionSuggestions.length > 0 && (
                        <div style={{ padding: '5px 12px', fontSize: 10, color: '#D1D5DB', borderTop: '1px solid #F3F4F6', background: '#FAFAFA', letterSpacing: '0.3px' }}>
                          ↑↓ navigate · Enter to select · Esc to dismiss
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* File attachment picker */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, background: '#F1F5F9', color: '#374151', border: '1px solid #E5E7EB', borderRadius: 7, cursor: 'pointer' }}
                >
                  📎 Attach files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => setPendingFiles(Array.from(e.target.files))}
                />
                {pendingFiles.length > 0 && (
                  <span style={{ fontSize: 12, color: '#6B7280' }}>
                    {pendingFiles.length} file(s) selected
                    <button onClick={() => { setPendingFiles([]); if (fileInputRef.current) fileInputRef.current.value = ''; }} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', marginLeft: 4 }}>✕</button>
                  </span>
                )}
              </div>

              <div className="comment-form-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>⌘+Enter to submit</span>
                <button
                  className="btn btn-sm"
                  style={{ background: isPublic ? '#1E293B' : '#D97706', color: '#fff', border: 'none' }}
                  onClick={postComment}
                  disabled={postingCmt}
                >
                  {postingCmt ? 'Sending…' : isPublic ? 'Send Reply' : 'Save Note'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
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
              <MetaField label={`Assigned To${details.group_id && filteredAgents.length === 0 ? ' (no agents in group)' : details.group_id ? ` (${filteredAgents.length} in group)` : ''}`} value={details.assigned_to || ''} onChange={(v) => setDetail('assigned_to', v)}>
                <option value="">— Unassigned —</option>
                {filteredAgents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.role})</option>)}
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
            </div>
            <button
              onClick={saveDetails}
              disabled={saving || !dirty}
              style={{
                marginTop: 14, width: '100%', padding: '8px 0', fontSize: 13, fontWeight: 700,
                background: dirty ? '#1E293B' : '#F3F4F6',
                color: dirty ? '#fff' : '#9CA3AF',
                border: 'none', borderRadius: 7,
                cursor: saving || !dirty ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>

          {/* Custom Fields */}
          {customFields.definitions.length > 0 && (
            <div className="detail-card">
              <h3>Custom Fields</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {customFields.definitions.map((def) => {
                  const val = customFields.values[def.id] ?? '';
                  return (
                    <div key={def.id} className="meta-field">
                      <label>{def.label}{def.required && <span style={{ color: '#DC2626', marginLeft: 2 }}>*</span>}</label>
                      {def.field_type === 'dropdown' ? (
                        <select className="meta-select" value={val} onChange={(e) => setCustomValue(def.id, e.target.value)}>
                          <option value="">— Select —</option>
                          {(def.options || []).map((opt) => <option key={opt}>{opt}</option>)}
                        </select>
                      ) : def.field_type === 'checkbox' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
                          <input type="checkbox" checked={val === 'true' || val === true} onChange={(e) => setCustomValue(def.id, e.target.checked ? 'true' : '')} style={{ width: 15, height: 15, cursor: 'pointer' }} />
                          <span style={{ fontSize: 12, color: '#374151' }}>{val === 'true' ? 'Yes' : 'No'}</span>
                        </div>
                      ) : def.field_type === 'textarea' ? (
                        <textarea className="meta-select" value={val} onChange={(e) => setCustomValue(def.id, e.target.value)} rows={3} style={{ background: '#fff', resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }} />
                      ) : def.field_type === 'date' ? (
                        <input type="date" className="meta-select" value={val} onChange={(e) => setCustomValue(def.id, e.target.value)} style={{ background: '#fff' }} />
                      ) : def.field_type === 'number' ? (
                        <input type="number" className="meta-select" value={val} onChange={(e) => setCustomValue(def.id, e.target.value)} style={{ background: '#fff' }} />
                      ) : def.field_type === 'url' ? (
                        <input type="url" className="meta-select" value={val} onChange={(e) => setCustomValue(def.id, e.target.value)} placeholder="https://" style={{ background: '#fff' }} />
                      ) : (
                        <input className="meta-select" value={val} onChange={(e) => setCustomValue(def.id, e.target.value)} style={{ background: '#fff' }} />
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                onClick={saveCustomFields}
                disabled={savingCustom || !customDirty}
                style={{
                  marginTop: 12, width: '100%', padding: '8px 0', fontSize: 13, fontWeight: 700,
                  background: customDirty ? '#2563EB' : '#F3F4F6',
                  color: customDirty ? '#fff' : '#9CA3AF',
                  border: 'none', borderRadius: 7,
                  cursor: savingCustom || !customDirty ? 'not-allowed' : 'pointer',
                }}
              >
                {savingCustom ? 'Saving…' : 'Save Custom Fields'}
              </button>
            </div>
          )}

          {/* Tags */}
          <div className="detail-card">
            <TagsSection ticketId={ticketId} />
          </div>

          {/* SLA Details */}
          {slaStatus?.policy && (
            <div className="detail-card">
              <h3>SLA</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Policy</div>
                  <div style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>{slaStatus.policy.name}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>First Response</div>
                  <div style={{ fontSize: 13, marginTop: 2, color: slaStatus.first_response_breached ? '#DC2626' : '#374151', fontWeight: slaStatus.first_response_breached ? 700 : 400 }}>
                    {slaStatus.is_resolved ? '✓ N/A' : slaStatus.first_response_breached ? `⚠ Overdue by ${fmtHours(Math.abs(slaStatus.first_response_remaining_hours))}` : `${fmtHours(slaStatus.first_response_remaining_hours)} remaining`}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Resolution</div>
                  <div style={{ fontSize: 13, marginTop: 2, color: slaStatus.resolution_breached ? '#DC2626' : '#374151', fontWeight: slaStatus.resolution_breached ? 700 : 400 }}>
                    {slaStatus.is_resolved ? '✓ Resolved' : slaStatus.resolution_breached ? `⚠ Overdue by ${fmtHours(Math.abs(slaStatus.resolution_remaining_hours))}` : `${fmtHours(slaStatus.resolution_remaining_hours)} remaining`}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Requester */}
          <div className="detail-card">
            <h3>Requester</h3>
            {ticket.requester_email ? (
              <div>
                <div style={{ fontSize: 13, color: '#374151', wordBreak: 'break-all' }}>
                  {ticket.requester_email}
                </div>
                <button
                  onClick={() => setShowHistory(true)}
                  style={{ marginTop: 8, fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600, display: 'block' }}
                >
                  📋 View all tickets from this customer
                </button>

                {/* CSAT */}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #F3F4F6' }}>
                  <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>CSAT Survey</div>
                  {csatRating?.submitted_at ? (
                    <div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {[1,2,3,4,5].map((n) => (
                          <span key={n} style={{ fontSize: 18, color: n <= csatRating.rating ? '#F59E0B' : '#E5E7EB' }}>★</span>
                        ))}
                        <span style={{ fontSize: 12, color: '#6B7280', marginLeft: 4 }}>{csatRating.rating}/5</span>
                      </div>
                      {csatRating.comment && <p style={{ fontSize: 12, color: '#374151', marginTop: 4, fontStyle: 'italic' }}>"{csatRating.comment}"</p>}
                      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Submitted {fmtDate(csatRating.submitted_at)}</div>
                    </div>
                  ) : csatRating?.sent_at ? (
                    <div style={{ fontSize: 12, color: '#6B7280' }}>
                      Survey sent {fmtDate(csatRating.sent_at)} — awaiting response
                    </div>
                  ) : (
                    <button
                      onClick={sendCsatSurvey}
                      disabled={sendingCsat || !isResolved}
                      title={!isResolved ? 'Resolve the ticket first to send a CSAT survey' : 'Send satisfaction survey to customer'}
                      style={{
                        padding: '5px 12px', fontSize: 12, fontWeight: 600,
                        background: isResolved ? '#F0FDF4' : '#F9FAFB',
                        color: isResolved ? '#166534' : '#9CA3AF',
                        border: `1px solid ${isResolved ? '#BBF7D0' : '#E5E7EB'}`,
                        borderRadius: 7, cursor: isResolved ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {sendingCsat ? 'Sending…' : '⭐ Send CSAT Survey'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <em style={{ color: '#9CA3AF', fontSize: 13 }}>Unknown</em>
            )}
          </div>

          {/* Timeline */}
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

      {/* Canned Response Picker */}
      {showCanned && (
        <CannedResponsePicker
          onSelect={insertCannedResponse}
          onClose={() => setShowCanned(false)}
        />
      )}

      {/* Customer history modal */}
      {showHistory && ticket.requester_email && (
        <CustomerHistoryModal
          email={ticket.requester_email}
          currentTicketId={ticket.id}
          onClose={() => setShowHistory(false)}
          onSelectTicket={onSelectTicket || (() => {})}
        />
      )}

      {/* Merge Ticket Modal */}
      {showMerge && (
        <div className="modal-overlay" onClick={() => { setShowMerge(false); setMergeTarget(null); setMergeSearch(''); setMergeResults([]); }}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🔀 Merge Ticket</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowMerge(false); setMergeTarget(null); setMergeSearch(''); setMergeResults([]); }}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 14 }}>
                Search for a duplicate ticket to merge into <strong>#{ticketId}</strong>. All comments, attachments, and tags from the duplicate will be copied here, and the duplicate will be closed.
              </p>
              <input
                autoFocus
                type="text"
                placeholder="Search by ticket ID, title, or email…"
                value={mergeSearch}
                onChange={(e) => searchMergeTickets(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: 14, border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none', fontFamily: 'inherit', marginBottom: 10 }}
              />
              {mergeResults.length > 0 && (
                <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
                  {mergeResults.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => setMergeTarget(t)}
                      style={{
                        padding: '10px 14px', cursor: 'pointer', fontSize: 13,
                        borderBottom: '1px solid #F3F4F6',
                        background: mergeTarget?.id === t.id ? '#EFF6FF' : '#fff',
                        borderLeft: mergeTarget?.id === t.id ? '3px solid #2563EB' : '3px solid transparent',
                      }}
                    >
                      <div style={{ fontWeight: 600, color: '#111827' }}>#{t.id} — {t.title}</div>
                      <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                        {t.status} · {t.priority} · {t.requester_email || 'No email'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {mergeSearch && mergeResults.length === 0 && (
                <div style={{ color: '#9CA3AF', fontSize: 13, padding: '12px 0', textAlign: 'center' }}>No tickets found.</div>
              )}
              {mergeTarget && (
                <div style={{ marginTop: 14, background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400E' }}>
                  ⚠ You are about to merge <strong>#{mergeTarget.id}</strong> into <strong>#{ticketId}</strong>. Ticket #{mergeTarget.id} will be <strong>closed</strong>.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowMerge(false); setMergeTarget(null); setMergeSearch(''); setMergeResults([]); }}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ background: '#7C3AED' }}
                disabled={!mergeTarget || merging}
                onClick={executeMerge}
              >
                {merging ? 'Merging…' : mergeTarget ? `Merge #${mergeTarget.id} here` : 'Select a ticket'}
              </button>
            </div>
          </div>
        </div>
      )}

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
      <select className="meta-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}
