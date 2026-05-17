/**
 * FeatureRequestsPage.jsx — Agent / Admin view of the Ideas Board
 *
 * Shows all submitted feature requests with real submitter info,
 * vote counts, status pipeline, voter list modal, official update
 * posting, and delete capability.
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useUser } from '../context/UserContext';
import { useToast } from '../components/Toast';

// ── Status config ─────────────────────────────────────────────────────────────
export const FEATURE_STATUSES = {
  submitted:    { label: 'Submitted',    bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', emoji: '📥' },
  under_review: { label: 'Under Review', bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA', emoji: '🔍' },
  planned:      { label: 'Planned',      bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE', emoji: '🗺️' },
  in_progress:  { label: 'In Progress',  bg: '#FEF3C7', text: '#92400E', border: '#FDE68A', emoji: '⚙️' },
  shipped:      { label: 'Shipped',      bg: '#F0FDF4', text: '#166534', border: '#BBF7D0', emoji: '🚀' },
  declined:     { label: 'Declined',     bg: '#FEF2F2', text: '#991B1B', border: '#FECACA', emoji: '❌' },
};

const STATUS_ORDER = ['submitted', 'under_review', 'planned', 'in_progress', 'shipped', 'declined'];

function StatusBadge({ status, size = 'sm' }) {
  const cfg = FEATURE_STATUSES[status] || FEATURE_STATUSES.submitted;
  const fs = size === 'sm' ? 11 : 13;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: size === 'sm' ? '2px 8px' : '4px 12px',
      borderRadius: 20, fontSize: fs, fontWeight: 600,
      background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}

function fmt(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Voters modal ──────────────────────────────────────────────────────────────
function VotersModal({ featureId, title, onClose }) {
  const [voters, setVoters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getFeatureVoters(featureId)
      .then(setVoters)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [featureId]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 24, width: 420,
        maxHeight: '70vh', display: 'flex', flexDirection: 'column',
        border: '1px solid #E5E7EB', boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: '#111827', fontSize: 16 }}>
            👍 Voters for "{title}"
          </h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#9CA3AF', fontSize: 20, cursor: 'pointer',
          }}>×</button>
        </div>
        {loading ? (
          <div style={{ color: '#6B7280', textAlign: 'center', padding: 24 }}>Loading…</div>
        ) : voters.length === 0 ? (
          <div style={{ color: '#6B7280', textAlign: 'center', padding: 24 }}>No votes yet</div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {voters.map((v, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: '1px solid #F3F4F6', fontSize: 13,
              }}>
                <span style={{ color: '#374151' }}>{v.voter_email}</span>
                <span style={{ color: '#9CA3AF' }}>{fmt(v.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function FeatureDetail({ feature, onBack, onUpdate, onDelete }) {
  const user = useUser();
  const toast = useToast();
  const [detail, setDetail] = useState(feature);
  const [commentBody, setCommentBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [showVoters, setShowVoters] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = useCallback(() => {
    api.getFeatureRequest(detail.id).then(setDetail).catch(() => {});
  }, [detail.id]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleStatusChange(newStatus) {
    setUpdatingStatus(true);
    try {
      const updated = await api.updateFeatureStatus(detail.id, newStatus);
      setDetail(d => ({ ...d, ...updated }));
      onUpdate({ ...detail, ...updated });
      toast('Status updated', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handlePostComment(e) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setPosting(true);
    try {
      await api.addFeatureComment(detail.id, {
        author: user.name,
        author_email: user.email,
        body: commentBody.trim(),
        is_official: true,
      });
      setCommentBody('');
      refresh();
      toast('Update posted', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setPosting(false);
    }
  }

  async function handleDeleteComment(cid) {
    try {
      await api.deleteFeatureComment(detail.id, cid);
      refresh();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function handleDelete() {
    try {
      await api.deleteFeatureRequest(detail.id);
      onDelete(detail.id);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  const comments = detail.comments || [];

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* Back */}
      <button onClick={onBack} style={{
        background: 'none', border: 'none', color: '#6B7280', fontSize: 13,
        cursor: 'pointer', padding: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 4,
      }}>← Back to Ideas Board</button>

      {/* Header card */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: 24, marginBottom: 20,
        border: '1px solid #E5E7EB',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: '0 0 8px 0', color: '#111827', fontSize: 20 }}>{detail.title}</h2>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#6B7280' }}>
              <span>By: <span style={{ color: '#374151' }}>{detail.submitter_name}</span></span>
              <span>({detail.submitter_email})</span>
              <span>·</span>
              <span>{fmt(detail.created_at)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <StatusBadge status={detail.status} size="md" />
            <button
              onClick={() => setShowVoters(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                borderRadius: 8, background: '#F9FAFB', border: '1px solid #E5E7EB',
                color: '#374151', fontSize: 13, cursor: 'pointer',
              }}
            >
              👍 {detail.vote_count} vote{detail.vote_count !== 1 ? 's' : ''}
            </button>
          </div>
        </div>

        {detail.description && (
          <p style={{ margin: '0 0 16px 0', color: '#374151', fontSize: 14, lineHeight: 1.6 }}>
            {detail.description}
          </p>
        )}

        {/* Status pipeline */}
        <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 16 }}>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Update Status
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {STATUS_ORDER.map(s => {
              const cfg = FEATURE_STATUSES[s];
              const isActive = detail.status === s;
              return (
                <button
                  key={s}
                  onClick={() => !isActive && handleStatusChange(s)}
                  disabled={updatingStatus}
                  style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    cursor: isActive ? 'default' : 'pointer',
                    background: isActive ? cfg.bg : '#F9FAFB',
                    color: isActive ? cfg.text : '#6B7280',
                    border: isActive ? `1px solid ${cfg.border}` : '1px solid #E5E7EB',
                    transition: 'all 0.15s',
                    opacity: updatingStatus ? 0.6 : 1,
                  }}
                >
                  {cfg.emoji} {cfg.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Official Updates */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: 24, marginBottom: 20,
        border: '1px solid #E5E7EB',
      }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#111827', fontSize: 15 }}>
          💬 Comments & Official Updates
        </h3>

        {/* Post official update */}
        <form onSubmit={handlePostComment} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>
            Post an official update (visible to customers as Helyx response)
          </div>
          <textarea
            value={commentBody}
            onChange={e => setCommentBody(e.target.value)}
            placeholder="Write an official update or response…"
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px',
              background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8,
              color: '#111827', fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
              lineHeight: 1.5, outline: 'none',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="submit"
              disabled={posting || !commentBody.trim()}
              style={{
                padding: '8px 18px', borderRadius: 8, border: 'none',
                background: posting || !commentBody.trim() ? '#E5E7EB' : '#1E293B',
                color: posting || !commentBody.trim() ? '#9CA3AF' : '#fff',
                fontSize: 13, fontWeight: 600, cursor: posting || !commentBody.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {posting ? 'Posting…' : '📣 Post Official Update'}
            </button>
          </div>
        </form>

        {/* Comment list */}
        {comments.length === 0 ? (
          <div style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            No comments yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {comments.map(c => (
              <div key={c.id} style={{
                padding: 14, borderRadius: 8,
                background: c.is_official ? '#EFF6FF' : '#F9FAFB',
                border: c.is_official ? '1px solid #BFDBFE' : '1px solid #E5E7EB',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {c.is_official && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                        background: '#1D4ED8', color: '#fff', letterSpacing: '0.04em',
                      }}>HELYX</span>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{c.author}</span>
                    {c.author_email && (
                      <span style={{ fontSize: 11, color: '#6B7280' }}>({c.author_email})</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>{fmt(c.created_at)}</span>
                    <button
                      onClick={() => handleDeleteComment(c.id)}
                      title="Delete comment"
                      style={{
                        background: 'none', border: 'none', color: '#D1D5DB', cursor: 'pointer',
                        fontSize: 14, padding: '2px 4px', borderRadius: 4,
                        transition: 'color 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
                      onMouseLeave={e => e.currentTarget.style.color = '#D1D5DB'}
                    >✕</button>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{c.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: 20,
        border: '1px solid #FECACA',
      }}>
        <div style={{ fontSize: 13, color: '#DC2626', fontWeight: 600, marginBottom: 8 }}>Danger Zone</div>
        {confirmDelete ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: '#374151' }}>Delete this feature request permanently?</span>
            <button onClick={handleDelete} style={{
              padding: '6px 14px', borderRadius: 6, border: 'none', background: '#DC2626',
              color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>Yes, Delete</button>
            <button onClick={() => setConfirmDelete(false)} style={{
              padding: '6px 14px', borderRadius: 6, border: '1px solid #E5E7EB', background: 'none',
              color: '#6B7280', fontSize: 12, cursor: 'pointer',
            }}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} style={{
            padding: '7px 16px', borderRadius: 6, border: '1px solid #FECACA',
            background: 'transparent', color: '#DC2626', fontSize: 13, cursor: 'pointer',
          }}>🗑 Delete Feature Request</button>
        )}
      </div>

      {showVoters && (
        <VotersModal featureId={detail.id} title={detail.title} onClose={() => setShowVoters(false)} />
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FeatureRequestsPage() {
  const toast = useToast();
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    api.getFeatureRequests()
      .then(setFeatures)
      .catch(e => toast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  function handleUpdate(updated) {
    setFeatures(fs => fs.map(f => f.id === updated.id ? { ...f, ...updated } : f));
    setSelected(s => s?.id === updated.id ? { ...s, ...updated } : s);
  }

  function handleDelete(id) {
    setFeatures(fs => fs.filter(f => f.id !== id));
    setSelected(null);
    toast('Feature request deleted', 'success');
  }

  if (selected) {
    return (
      <div style={{ padding: 24 }}>
        <FeatureDetail
          feature={selected}
          onBack={() => setSelected(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      </div>
    );
  }

  const filtered = features.filter(f => {
    if (filter !== 'all' && f.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!f.title.toLowerCase().includes(q) && !f.description.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Count per status
  const counts = {};
  features.forEach(f => { counts[f.status] = (counts[f.status] || 0) + 1; });

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: '0 0 4px 0', color: '#111827', fontSize: 20 }}>💡 Ideas Board</h2>
          <p style={{ margin: 0, color: '#6B7280', fontSize: 13 }}>
            {features.length} idea{features.length !== 1 ? 's' : ''} submitted by customers
          </p>
        </div>
        <button onClick={load} style={{
          padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB',
          background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer',
        }}>↺ Refresh</button>
      </div>

      {/* Pipeline summary */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        {STATUS_ORDER.map(s => {
          const cfg = FEATURE_STATUSES[s];
          const cnt = counts[s] || 0;
          return (
            <div key={s} style={{
              padding: '10px 16px', borderRadius: 10, minWidth: 100, textAlign: 'center',
              background: filter === s ? cfg.bg : '#fff',
              border: `1px solid ${cnt > 0 || filter === s ? cfg.border : '#E5E7EB'}`,
              cursor: 'pointer',
              outline: filter === s ? `2px solid ${cfg.text}` : 'none',
              outlineOffset: 1,
            }} onClick={() => setFilter(filter === s ? 'all' : s)}>
              <div style={{ fontSize: 20, marginBottom: 2 }}>{cfg.emoji}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: cnt > 0 ? cfg.text : '#D1D5DB' }}>{cnt}</div>
              <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>{cfg.label}</div>
            </div>
          );
        })}
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search ideas…"
          style={{
            flex: 1, maxWidth: 320, padding: '8px 12px', borderRadius: 8,
            background: '#fff', border: '1px solid #E5E7EB', color: '#111827',
            fontSize: 13, outline: 'none',
          }}
        />
        {filter !== 'all' && (
          <button onClick={() => setFilter('all')} style={{
            padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E7EB',
            background: '#fff', color: '#6B7280', fontSize: 12, cursor: 'pointer',
          }}>✕ Clear filter</button>
        )}
        <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' }}>
          {filtered.length} of {features.length} shown
        </span>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ color: '#9CA3AF', textAlign: 'center', padding: 60 }}><div className="spinner" />Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{
          color: '#9CA3AF', textAlign: 'center', padding: 60,
          background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB',
        }}>
          {features.length === 0 ? 'No ideas submitted yet' : 'No results match your filter'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(f => (
            <div
              key={f.id}
              onClick={() => setSelected(f)}
              style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px',
                background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB',
                cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#BFDBFE';
                e.currentTarget.style.boxShadow = '0 1px 6px rgba(59,130,246,0.08)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#E5E7EB';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {/* Vote count bubble */}
              <div style={{
                minWidth: 52, textAlign: 'center', padding: '8px 6px',
                borderRadius: 8, background: '#F9FAFB', border: '1px solid #E5E7EB',
                flexShrink: 0,
              }}>
                <div style={{ fontSize: 18, lineHeight: 1 }}>👍</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginTop: 2 }}>{f.vote_count}</div>
              </div>

              {/* Main content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {f.title}
                </div>
                {f.description && (
                  <div style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.description}
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                  By {f.submitter_name} ({f.submitter_email}) · {fmt(f.created_at)}
                </div>
              </div>

              <StatusBadge status={f.status} />
              <span style={{ color: '#D1D5DB', fontSize: 18 }}>›</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
