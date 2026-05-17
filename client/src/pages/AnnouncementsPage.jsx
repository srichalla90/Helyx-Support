import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { useProducts } from '../context/ProductsContext';

// ── Type config ───────────────────────────────────────────────────────────────

export const ANNOUNCEMENT_TYPES = {
  new_feature:  { label: 'New Feature',  emoji: '🚀', bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  coming_soon:  { label: 'Coming Soon',  emoji: '🗺️', bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE' },
  maintenance:  { label: 'Maintenance',  emoji: '🔧', bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' },
  general:      { label: 'Announcement', emoji: '📣', bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },
  bug_fix:      { label: 'Bug Fix',      emoji: '🐛', bg: '#FEF2F2', text: '#991B1B', border: '#FECACA' },
};

function TypeBadge({ type, size = 'sm' }) {
  const cfg = ANNOUNCEMENT_TYPES[type] || ANNOUNCEMENT_TYPES.general;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: size === 'sm' ? 11 : 13, fontWeight: 600,
      background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`,
      borderRadius: 20, padding: size === 'sm' ? '2px 10px' : '4px 14px',
    }}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}

function StatusDot({ status }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 12, fontWeight: 600,
      color: status === 'published' ? '#059669' : '#92400E',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', display: 'inline-block',
        background: status === 'published' ? '#10B981' : '#F59E0B',
      }} />
      {status === 'published' ? 'Published' : 'Draft'}
    </span>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Toolbar button ────────────────────────────────────────────────────────────
function ToolbarBtn({ title, onClick, children }) {
  return (
    <button
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      style={{
        padding: '4px 8px', fontSize: 13, border: '1px solid #E5E7EB',
        borderRadius: 5, cursor: 'pointer', lineHeight: 1.2,
        background: '#fff', color: '#374151',
        minWidth: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}

// ── Publish confirmation modal ────────────────────────────────────────────────
// Shown when pressing "Publish" from the list row quick-action.

function audienceLabel(products) {
  const list = parseProducts(products);
  if (!list.length) return 'all customers';
  return list.join(' & ') + ' customers only';
}

function parseProducts(raw) {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw || '[]'); } catch (_) { return []; }
}

function PublishConfirmModal({ announcement, onConfirm, onCancel }) {
  const [sendEmail, setSendEmail] = useState(true);
  const audience = audienceLabel(announcement.products);
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2>Publish Announcement</h2>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: 20 }}>
            Publish <strong>"{announcement.title}"</strong>? It will appear in the customer portal immediately.
          </p>

          {/* Email blast checkbox */}
          <label
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
              padding: '14px 16px', borderRadius: 10,
              background: sendEmail ? '#EFF6FF' : '#F9FAFB',
              border: `1px solid ${sendEmail ? '#BFDBFE' : '#E5E7EB'}`,
              transition: 'all 0.15s',
            }}
          >
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', accentColor: '#2563EB' }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E40AF', marginBottom: 3 }}>
                📧 Send email blast
              </div>
              <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5 }}>
                Email will be sent to <strong>{audience}</strong>. Uncheck to publish silently without notifying anyone.
              </div>
            </div>
          </label>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => onConfirm(sendEmail)}
            style={{ background: '#1E293B', color: '#fff', border: 'none' }}
          >
            🚀 {sendEmail ? 'Publish & Send Email' : 'Publish Silently'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Announcement editor panel ─────────────────────────────────────────────────

function AnnouncementEditor({ initial, onSaved, onCancel }) {
  const toast = useToast();
  const { products: ALL_PRODUCTS } = useProducts();
  const editorRef = useRef(null);

  const [title,     setTitle]     = useState(initial?.title  || '');
  const [type,      setType]      = useState(initial?.type   || 'general');
  const [pinned,    setPinned]    = useState(!!initial?.pinned);
  const [sendEmail, setSendEmail] = useState(true);
  const [products,  setProducts]  = useState(() => parseProducts(initial?.products));
  const [saving,    setSaving]    = useState(null); // null | 'draft' | 'published'

  // Show email checkbox only when this is a new article or currently a draft
  const isDraftOrNew = !initial?.id || initial?.status === 'draft';

  const audience = products.length === 0 ? 'all customers' : products.join(' & ') + ' customers only';

  useEffect(() => {
    if (editorRef.current && initial?.body) {
      editorRef.current.innerHTML = initial.body;
    }
  }, []);

  function exec(cmd, value = null) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
  }

  function toggleProduct(p) {
    setProducts((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  async function handleSave(status) {
    if (!title.trim()) { toast('Title is required', 'error'); return; }
    setSaving(status);
    try {
      const body = editorRef.current?.innerHTML || '';
      const payload = {
        title: title.trim(), body, type, status, pinned, products,
        send_email: status === 'published' && isDraftOrNew ? sendEmail : false,
      };
      const saved = initial?.id
        ? await api.updateAnnouncement(initial.id, payload)
        : await api.createAnnouncement(payload);

      const blasted = status === 'published' && isDraftOrNew && sendEmail;
      toast(
        status === 'published'
          ? blasted ? `Published & email sent to ${audience}!` : 'Published!'
          : 'Draft saved',
        'success'
      );
      onSaved(saved);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 14 }}>
        <input
          type="text"
          placeholder="Announcement title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ flex: 1, fontSize: 17, fontWeight: 700, border: 'none', outline: 'none', color: '#111827', background: 'transparent' }}
        />
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          <button onClick={onCancel} disabled={!!saving} style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, background: '#F9FAFB', color: '#374151', border: '1px solid #E5E7EB', borderRadius: 7, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={() => handleSave('draft')} disabled={!!saving} style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, background: '#F1F5F9', color: '#1E293B', border: '1px solid #CBD5E1', borderRadius: 7, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving === 'draft' ? 'Saving…' : '📋 Save Draft'}
          </button>
          <button onClick={() => handleSave('published')} disabled={!!saving} style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, background: '#1E293B', color: '#fff', border: 'none', borderRadius: 7, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving === 'published'
              ? 'Publishing…'
              : (sendEmail && isDraftOrNew ? '🚀 Publish & Email' : '🚀 Publish')}
          </button>
        </div>
      </div>

      {/* Meta row */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #F3F4F6', background: '#F9FAFB', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Type selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>Type</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(ANNOUNCEMENT_TYPES).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setType(key)}
                style={{
                  padding: '4px 12px', fontSize: 12, fontWeight: 600, borderRadius: 20, cursor: 'pointer',
                  background: type === key ? cfg.bg : '#fff',
                  color:      type === key ? cfg.text : '#6B7280',
                  border:     `1px solid ${type === key ? cfg.border : '#E5E7EB'}`,
                }}
              >
                {cfg.emoji} {cfg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Pin toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: pinned ? '#1E293B' : '#9CA3AF' }}>
          <div
            onClick={() => setPinned((v) => !v)}
            style={{
              width: 36, height: 20, borderRadius: 10, cursor: 'pointer', transition: 'background 0.2s',
              background: pinned ? '#1E293B' : '#E5E7EB', position: 'relative',
            }}
          >
            <div style={{
              position: 'absolute', top: 2, left: pinned ? 18 : 2,
              width: 16, height: 16, borderRadius: '50%', background: '#fff',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </div>
          📌 Pin to top of portal
        </label>
      </div>

      {/* Audience / product targeting */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid #F3F4F6', background: '#FAFAFA', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', flexShrink: 0 }}>🎯 Audience</span>
        {ALL_PRODUCTS.length === 0 ? (
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>No products configured — blast goes to all customers</span>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* "All" pill */}
            <button
              onClick={() => setProducts([])}
              style={{
                padding: '4px 12px', fontSize: 12, fontWeight: 600, borderRadius: 20, cursor: 'pointer',
                background: products.length === 0 ? '#1E293B' : '#F9FAFB',
                color:      products.length === 0 ? '#fff'     : '#6B7280',
                border:     products.length === 0 ? 'none'     : '1px solid #E5E7EB',
              }}
            >
              All products
            </button>
            {ALL_PRODUCTS.map((p) => (
              <button
                key={p}
                onClick={() => toggleProduct(p)}
                style={{
                  padding: '4px 12px', fontSize: 12, fontWeight: 600, borderRadius: 20, cursor: 'pointer',
                  background: products.includes(p) ? '#EFF6FF' : '#F9FAFB',
                  color:      products.includes(p) ? '#1D4ED8' : '#6B7280',
                  border:     products.includes(p) ? '1px solid #BFDBFE' : '1px solid #E5E7EB',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        {products.length > 0 && (
          <span style={{ fontSize: 11, color: '#6B7280', marginLeft: 4 }}>
            → will notify <strong>{audience}</strong>
          </span>
        )}
      </div>

      {/* Email blast option — only for drafts/new being published */}
      {isDraftOrNew && (
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #F3F4F6', background: '#FAFAFA' }}>
          <label
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              padding: '9px 14px', borderRadius: 8,
              background: sendEmail ? '#EFF6FF' : '#F9FAFB',
              border: `1px solid ${sendEmail ? '#BFDBFE' : '#E5E7EB'}`,
              transition: 'all 0.15s',
            }}
          >
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#2563EB' }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: sendEmail ? '#1E40AF' : '#6B7280' }}>
              📧 Send email to {audience} when published
            </span>
            {!sendEmail && (
              <span style={{ fontSize: 12, color: '#9CA3AF' }}>(publish silently)</span>
            )}
          </label>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '10px 16px', borderBottom: '1px solid #F3F4F6', background: '#F9FAFB', alignItems: 'center' }}>
        <ToolbarBtn title="Bold" onClick={() => exec('bold')}><strong>B</strong></ToolbarBtn>
        <ToolbarBtn title="Italic" onClick={() => exec('italic')}><em>I</em></ToolbarBtn>
        <ToolbarBtn title="Underline" onClick={() => exec('underline')}><u>U</u></ToolbarBtn>
        <div style={{ width: 1, height: 20, background: '#E5E7EB', margin: '0 4px' }} />
        <ToolbarBtn title="Heading 2" onClick={() => exec('formatBlock', 'H2')}>H2</ToolbarBtn>
        <ToolbarBtn title="Heading 3" onClick={() => exec('formatBlock', 'H3')}>H3</ToolbarBtn>
        <ToolbarBtn title="Paragraph" onClick={() => exec('formatBlock', 'P')}>¶</ToolbarBtn>
        <div style={{ width: 1, height: 20, background: '#E5E7EB', margin: '0 4px' }} />
        <ToolbarBtn title="Bullet list" onClick={() => exec('insertUnorderedList')}>• List</ToolbarBtn>
        <ToolbarBtn title="Numbered list" onClick={() => exec('insertOrderedList')}>1. List</ToolbarBtn>
        <div style={{ width: 1, height: 20, background: '#E5E7EB', margin: '0 4px' }} />
        <ToolbarBtn title="Undo" onClick={() => exec('undo')}>↩</ToolbarBtn>
        <ToolbarBtn title="Redo" onClick={() => exec('redo')}>↪</ToolbarBtn>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Write your announcement…"
        style={{ minHeight: 260, padding: '20px 24px', fontSize: 14, lineHeight: 1.7, color: '#111827', outline: 'none' }}
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnnouncementsPage() {
  const toast = useToast();
  const [announcements,  setAnnouncements]  = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [mode,           setMode]           = useState('list'); // 'list' | 'editor'
  const [editing,        setEditing]        = useState(null);
  const [deleteTarget,   setDeleteTarget]   = useState(null);
  const [publishTarget,  setPublishTarget]  = useState(null); // pending publish confirm

  async function load() {
    try {
      const rows = await api.getAnnouncements();
      setAnnouncements(rows);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function handleSaved(saved) {
    setAnnouncements((prev) => {
      const exists = prev.find((a) => a.id === saved.id);
      return exists ? prev.map((a) => a.id === saved.id ? saved : a) : [saved, ...prev];
    });
    setMode('list');
    setEditing(null);
  }

  async function handleDelete() {
    const id = deleteTarget.id;
    setDeleteTarget(null);
    try {
      await api.deleteAnnouncement(id);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      toast('Deleted', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  // Publish button in list — reverting needs no confirm; publishing shows modal
  function requestPublish(ann) {
    if (ann.status === 'published') {
      doToggle(ann, false); // revert to draft, no email
    } else {
      setPublishTarget(ann);
    }
  }

  async function doToggle(ann, sendEmail) {
    setPublishTarget(null);
    const newStatus = ann.status === 'published' ? 'draft' : 'published';
    try {
      const updated = await api.updateAnnouncement(ann.id, {
        ...ann,
        status: newStatus,
        send_email: sendEmail,
      });
      setAnnouncements((prev) => prev.map((a) => a.id === ann.id ? updated : a));
      if (newStatus === 'published') {
        toast(sendEmail ? 'Published & email sent to customers!' : 'Published!', 'success');
      } else {
        toast('Reverted to draft', 'success');
      }
    } catch (e) { toast(e.message, 'error'); }
  }

  if (loading) return <div className="loading"><div className="spinner" /> Loading…</div>;

  if (mode === 'editor') {
    return (
      <AnnouncementEditor
        initial={editing}
        onSaved={handleSaved}
        onCancel={() => { setMode('list'); setEditing(null); }}
      />
    );
  }

  return (
    <div>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>
          {announcements.filter((a) => a.status === 'published').length} published · {announcements.filter((a) => a.status === 'draft').length} drafts
        </p>
        <button
          onClick={() => { setEditing(null); setMode('editor'); }}
          style={{ padding: '8px 18px', fontSize: 13, fontWeight: 700, background: '#1E293B', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >
          + New Announcement
        </button>
      </div>

      {/* List */}
      {announcements.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '64px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📣</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 8 }}>No announcements yet</div>
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>Create one to keep customers informed about new features and updates.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {announcements.map((ann) => (
            <div
              key={ann.id}
              style={{
                background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB',
                padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 16,
              }}
            >
              <div style={{ fontSize: 26, flexShrink: 0, marginTop: 2 }}>
                {ANNOUNCEMENT_TYPES[ann.type]?.emoji || '📣'}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{ann.title}</span>
                  {ann.pinned === 1 && <span style={{ fontSize: 11, color: '#6B7280' }}>📌 Pinned</span>}
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <TypeBadge type={ann.type} />
                  <StatusDot status={ann.status} />
                  {/* Audience badge */}
                  {(() => {
                    const prods = parseProducts(ann.products);
                    return prods.length > 0 ? (
                      <span style={{ fontSize: 11, fontWeight: 600, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: 20, padding: '2px 8px' }}>
                        🎯 {prods.join(', ')}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>All products</span>
                    );
                  })()}
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                    {ann.status === 'published' ? `Published ${fmtDate(ann.published_at)}` : `Updated ${fmtDate(ann.updated_at)}`}
                  </span>
                </div>
                {ann.body && (
                  <div
                    style={{ fontSize: 13, color: '#6B7280', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {ann.body ? ann.body.replace(/<[^>]*>/g, ' ').trim().slice(0, 120) : ''}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                <button
                  onClick={() => requestPublish(ann)}
                  style={{
                    padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 7, cursor: 'pointer',
                    background: ann.status === 'published' ? '#F9FAFB' : '#1E293B',
                    color:      ann.status === 'published' ? '#374151' : '#fff',
                    border:     ann.status === 'published' ? '1px solid #E5E7EB' : 'none',
                  }}
                >
                  {ann.status === 'published' ? '📋 Revert to Draft' : '🚀 Publish'}
                </button>
                <button
                  onClick={() => { setEditing(ann); setMode('editor'); }}
                  style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, background: '#F1F5F9', color: '#1E293B', border: '1px solid #E5E7EB', borderRadius: 7, cursor: 'pointer' }}
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={() => setDeleteTarget(ann)}
                  style={{ padding: '5px 10px', fontSize: 12, background: 'none', border: '1px solid #FCA5A5', borderRadius: 7, color: '#DC2626', cursor: 'pointer' }}
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Publish confirmation modal */}
      {publishTarget && (
        <PublishConfirmModal
          announcement={publishTarget}
          onConfirm={(sendEmail) => doToggle(publishTarget, sendEmail)}
          onCancel={() => setPublishTarget(null)}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2>Delete Announcement</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p>Delete "<strong>{deleteTarget.title}</strong>"? This cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
