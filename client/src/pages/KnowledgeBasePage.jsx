import { useState, useEffect, useRef, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { useUser } from '../context/UserContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fileIcon(mimetype = '', name = '') {
  const ext = name.split('.').pop().toLowerCase();
  if (mimetype.includes('pdf')  || ext === 'pdf')                   return '📕';
  if (mimetype.includes('sheet') || mimetype.includes('excel') || ['xlsx','xls'].includes(ext)) return '📊';
  if (mimetype.includes('csv')  || ext === 'csv')                   return '📋';
  if (mimetype.includes('word') || ['doc','docx'].includes(ext))    return '📝';
  if (mimetype.includes('image') || ['png','jpg','jpeg','gif','webp'].includes(ext)) return '🖼️';
  if (mimetype.includes('zip')  || ['zip','tar','gz'].includes(ext)) return '🗜️';
  return '📄';
}

// Build a nested tree from a flat list of folders
function buildTree(folders, parentId = null) {
  return folders
    .filter((f) => (f.parent_id ?? null) === parentId)
    .map((f) => ({ ...f, children: buildTree(folders, f.id) }));
}

// Return path from root → folderId as array of folder objects
function breadcrumb(folders, folderId) {
  if (!folderId) return [];
  const f = folders.find((x) => x.id === folderId);
  if (!f) return [];
  return [...breadcrumb(folders, f.parent_id ?? null), f];
}

// Detect video URL type and return the appropriate embed HTML
function getVideoEmbedHtml(url) {
  url = url.trim();

  // YouTube: youtube.com/watch?v=ID  |  youtu.be/ID  |  youtube.com/shorts/ID
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (yt) {
    return `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px;margin:12px 0"><iframe src="https://www.youtube.com/embed/${yt[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe></div>`;
  }

  // Vimeo: vimeo.com/ID  |  vimeo.com/video/ID
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) {
    return `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px;margin:12px 0"><iframe src="https://player.vimeo.com/video/${vimeo[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" allow="autoplay;fullscreen;picture-in-picture" allowfullscreen></iframe></div>`;
  }

  // Loom: loom.com/share/ID
  const loom = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
  if (loom) {
    return `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px;margin:12px 0"><iframe src="https://www.loom.com/embed/${loom[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" allowfullscreen></iframe></div>`;
  }

  // Direct video file (.mp4, .webm, .ogg)
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) {
    return `<div style="margin:12px 0"><video controls style="width:100%;border-radius:8px;max-height:480px"><source src="${url}">Your browser does not support the video tag.</video></div>`;
  }

  return null; // unrecognized
}

function detectPlatform(url) {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'YouTube';
  if (/vimeo\.com/i.test(url))             return 'Vimeo';
  if (/loom\.com/i.test(url))              return 'Loom';
  if (/\.(mp4|webm|ogg)/i.test(url))       return 'video file';
  return null;
}

// ── Rich text toolbar button ──────────────────────────────────────────────────

function ToolbarBtn({ title, onClick, active, children }) {
  return (
    <button
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      style={{
        padding: '4px 8px', fontSize: 13, border: '1px solid #E5E7EB',
        borderRadius: 5, cursor: 'pointer', lineHeight: 1.2,
        background: active ? '#E0E7FF' : '#fff',
        color: active ? '#3730A3' : '#374151',
        fontWeight: active ? 700 : 400,
        minWidth: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}

// ── Article Editor ─────────────────────────────────────────────────────────────

function ArticleEditor({ folderId, article, onSave, onCancel }) {
  const toast = useToast();
  const editorRef    = useRef(null);
  const fileInputRef = useRef(null);
  const savedRangeRef = useRef(null); // cursor position saved before video dialog opens

  const [title,      setTitle]      = useState(article?.title   || '');
  const [saving,     setSaving]     = useState(null); // null | 'draft' | 'published'
  const [uploading,  setUploading]  = useState(false);
  const [attachments, setAttachments] = useState(article?.files || []);
  const [videoDialog, setVideoDialog] = useState(false);
  const [videoUrl,   setVideoUrl]   = useState('');
  // savedArticleId is set as soon as the article is created on the server
  const [savedArticleId, setSavedArticleId] = useState(article?.id || null);

  useEffect(() => {
    if (editorRef.current && article?.content) {
      editorRef.current.innerHTML = article.content;
    }
  }, []);

  function exec(cmd, value = null) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
  }

  function getContent() {
    return editorRef.current?.innerHTML || '';
  }

  async function ensureArticleSaved() {
    if (savedArticleId) return savedArticleId;
    // Create a stub draft so we have an ID to attach files to
    const created = await api.createKbArticle({ folder_id: folderId, title: title.trim() || 'Untitled', content: getContent(), status: 'draft' });
    setSavedArticleId(created.id);
    return created.id;
  }

  async function handleSave(status) {
    if (!title.trim()) { toast('Please enter an article title', 'error'); return; }
    setSaving(status);
    try {
      const content = getContent();
      let saved;
      if (savedArticleId) {
        saved = await api.updateKbArticle(savedArticleId, { title: title.trim(), content, status });
      } else {
        saved = await api.createKbArticle({ folder_id: folderId, title: title.trim(), content, status });
        setSavedArticleId(saved.id);
      }
      toast(status === 'published' ? 'Article published!' : 'Draft saved', 'success');
      onSave({ ...saved, files: attachments });
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(null);
    }
  }

  async function handleAttach(e) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      const artId = await ensureArticleSaved();
      const fd = new FormData();
      for (const f of fileList) fd.append('files', f);
      const newFiles = await api.uploadArticleFiles(artId, fd);
      setAttachments((prev) => [...prev, ...newFiles]);
      toast(`${newFiles.length} file${newFiles.length !== 1 ? 's' : ''} attached`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function removeAttachment(fileId) {
    try {
      await api.deleteArticleFile(fileId);
      setAttachments((prev) => prev.filter((f) => f.id !== fileId));
    } catch (e) { toast(e.message, 'error'); }
  }

  function insertVideo() {
    const html = getVideoEmbedHtml(videoUrl);
    if (!html) {
      toast('Unrecognized URL. Paste a YouTube, Vimeo, Loom, or direct .mp4/.webm link.', 'error');
      return;
    }
    // Grab the saved range before any state changes clear it
    const savedRange = savedRangeRef.current;
    savedRangeRef.current = null;

    setVideoDialog(false);
    setVideoUrl('');

    // Defer until after React finishes re-rendering the dialog closed,
    // otherwise the selection restore runs before the DOM settles and the
    // browser resets the cursor to position 0.
    setTimeout(() => {
      editorRef.current?.focus();
      if (savedRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
      document.execCommand('insertHTML', false, html);
    }, 0);
  }

  const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <input
          type="text"
          placeholder="Article title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            flex: 1, fontSize: 18, fontWeight: 700, border: 'none', outline: 'none',
            color: '#111827', background: 'transparent',
          }}
        />
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          {article?.version && (
            <span style={{ fontSize: 11, fontWeight: 600, background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', borderRadius: 20, padding: '3px 10px', letterSpacing: '0.3px' }}>
              v{article.version}
            </span>
          )}
          <button
            onClick={onCancel}
            disabled={!!saving}
            style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, background: '#F9FAFB', color: '#374151', border: '1px solid #E5E7EB', borderRadius: 7, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
          >
            Cancel
          </button>
          <button
            onClick={() => handleSave('draft')}
            disabled={!!saving}
            style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, background: '#F1F5F9', color: '#1E293B', border: '1px solid #CBD5E1', borderRadius: 7, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving === 'draft' ? 'Saving…' : '📋 Save Draft'}
          </button>
          <button
            onClick={() => handleSave('published')}
            disabled={!!saving}
            style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, background: '#1E293B', color: '#fff', border: 'none', borderRadius: 7, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving === 'published' ? 'Publishing…' : '🚀 Publish Article'}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 4, padding: '10px 16px',
        borderBottom: '1px solid #F3F4F6', background: '#F9FAFB', alignItems: 'center',
      }}>
        {/* Text style */}
        <ToolbarBtn title="Bold" onClick={() => exec('bold')}><strong>B</strong></ToolbarBtn>
        <ToolbarBtn title="Italic" onClick={() => exec('italic')}><em>I</em></ToolbarBtn>
        <ToolbarBtn title="Underline" onClick={() => exec('underline')}><u>U</u></ToolbarBtn>
        <ToolbarBtn title="Strikethrough" onClick={() => exec('strikeThrough')}><s>S</s></ToolbarBtn>

        <div style={{ width: 1, height: 20, background: '#E5E7EB', margin: '0 4px' }} />

        {/* Headings */}
        <ToolbarBtn title="Heading 1" onClick={() => exec('formatBlock', 'H1')}>H1</ToolbarBtn>
        <ToolbarBtn title="Heading 2" onClick={() => exec('formatBlock', 'H2')}>H2</ToolbarBtn>
        <ToolbarBtn title="Heading 3" onClick={() => exec('formatBlock', 'H3')}>H3</ToolbarBtn>
        <ToolbarBtn title="Paragraph" onClick={() => exec('formatBlock', 'P')}>¶</ToolbarBtn>

        <div style={{ width: 1, height: 20, background: '#E5E7EB', margin: '0 4px' }} />

        {/* Lists */}
        <ToolbarBtn title="Bullet list" onClick={() => exec('insertUnorderedList')}>• List</ToolbarBtn>
        <ToolbarBtn title="Numbered list" onClick={() => exec('insertOrderedList')}>1. List</ToolbarBtn>

        <div style={{ width: 1, height: 20, background: '#E5E7EB', margin: '0 4px' }} />

        {/* Alignment */}
        <ToolbarBtn title="Align left"   onClick={() => exec('justifyLeft')}>⬅</ToolbarBtn>
        <ToolbarBtn title="Align center" onClick={() => exec('justifyCenter')}>⬛</ToolbarBtn>
        <ToolbarBtn title="Align right"  onClick={() => exec('justifyRight')}>➡</ToolbarBtn>

        <div style={{ width: 1, height: 20, background: '#E5E7EB', margin: '0 4px' }} />

        {/* Font size */}
        <select
          onChange={(e) => {
            editorRef.current?.focus();
            document.execCommand('fontSize', false, '7');
            const els = editorRef.current?.querySelectorAll('font[size="7"]');
            els?.forEach((el) => { el.removeAttribute('size'); el.style.fontSize = e.target.value; });
          }}
          defaultValue=""
          style={{ fontSize: 12, padding: '3px 6px', borderRadius: 5, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer' }}
        >
          <option value="" disabled>Size</option>
          {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Text color */}
        <input
          type="color"
          title="Text color"
          onChange={(e) => exec('foreColor', e.target.value)}
          style={{ width: 28, height: 28, padding: 2, border: '1px solid #E5E7EB', borderRadius: 5, cursor: 'pointer', background: '#fff' }}
        />

        <div style={{ width: 1, height: 20, background: '#E5E7EB', margin: '0 4px' }} />

        {/* Indent */}
        <ToolbarBtn title="Indent" onClick={() => exec('indent')}>→|</ToolbarBtn>
        <ToolbarBtn title="Outdent" onClick={() => exec('outdent')}>|←</ToolbarBtn>

        <div style={{ width: 1, height: 20, background: '#E5E7EB', margin: '0 4px' }} />

        {/* Video embed */}
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            // Save cursor position before the dialog steals focus
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
              savedRangeRef.current = sel.getRangeAt(0).cloneRange();
            }
            setVideoDialog(true);
          }}
          title="Embed video (YouTube, Vimeo, Loom, or direct link)"
          style={{
            padding: '4px 10px', fontSize: 12, fontWeight: 600, border: '1px solid #E5E7EB',
            borderRadius: 5, cursor: 'pointer', background: '#fff', color: '#374151',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          🎬 Embed Video
        </button>

        {/* Attach files */}
        <button
          onMouseDown={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
          disabled={uploading}
          title="Attach files"
          style={{
            padding: '4px 10px', fontSize: 12, fontWeight: 600, border: '1px solid #E5E7EB',
            borderRadius: 5, cursor: uploading ? 'not-allowed' : 'pointer',
            background: '#fff', color: '#374151',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            opacity: uploading ? 0.6 : 1,
          }}
        >
          📎 {uploading ? 'Uploading…' : 'Attach Files'}
        </button>
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleAttach} />

        {/* Undo / Redo */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <ToolbarBtn title="Undo" onClick={() => exec('undo')}>↩</ToolbarBtn>
          <ToolbarBtn title="Redo" onClick={() => exec('redo')}>↪</ToolbarBtn>
        </div>
      </div>

      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        style={{
          minHeight: 340, padding: '20px 24px',
          fontSize: 14, lineHeight: 1.7, color: '#111827',
          outline: 'none',
        }}
        onKeyDown={(e) => {
          // Tab → indent
          if (e.key === 'Tab') { e.preventDefault(); exec(e.shiftKey ? 'outdent' : 'indent'); }
        }}
        data-placeholder="Start writing your article…"
      />

      {/* Attachments list */}
      {attachments.length > 0 && (
        <div style={{ borderTop: '1px solid #F3F4F6', padding: '12px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            Attachments ({attachments.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {attachments.map((f) => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span>{fileIcon(f.mimetype, f.display_name)}</span>
                <span style={{ flex: 1, color: '#374151' }}>{f.display_name}</span>
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtSize(f.size)}</span>
                <button
                  onClick={() => removeAttachment(f.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 12 }}
                >✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Video embed dialog */}
      {videoDialog && (
        <div className="modal-overlay" onClick={() => setVideoDialog(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Embed Video</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setVideoDialog(false)}>✕</button>
            </div>
            <div className="modal-body">
              <input
                autoFocus
                type="text"
                placeholder="Paste a video URL…"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') insertVideo(); }}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid #D1D5DB', fontSize: 14 }}
              />
              {/* Live platform detection */}
              <div style={{ marginTop: 8, fontSize: 12, color: videoUrl.trim() ? (getVideoEmbedHtml(videoUrl) ? '#059669' : '#DC2626') : '#9CA3AF' }}>
                {videoUrl.trim()
                  ? getVideoEmbedHtml(videoUrl)
                    ? `✓ Detected: ${detectPlatform(videoUrl)}`
                    : '✗ Unrecognized — try a YouTube, Vimeo, or Loom link, or a direct .mp4 URL'
                  : 'Supports YouTube, Vimeo, Loom, or a direct .mp4 / .webm link'}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setVideoDialog(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={insertVideo} disabled={!videoUrl.trim()}>Embed</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Article Viewer ─────────────────────────────────────────────────────────────

function ArticleViewer({ article, onEdit, onDelete, onClose, onStatusChange, canEdit }) {
  const [toggling, setToggling] = useState(false);
  const isDraft = article.status !== 'published';

  async function toggleStatus() {
    setToggling(true);
    try {
      await onStatusChange(isDraft ? 'published' : 'draft');
    } finally {
      setToggling(false);
    }
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: 18, padding: '2px 6px', borderRadius: 5 }}
          title="Back"
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111827' }}>{article.title}</h2>
            {isDraft ? (
              <span style={{ fontSize: 11, fontWeight: 700, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 20, padding: '2px 10px', letterSpacing: '0.3px' }}>
                DRAFT
              </span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 700, background: '#D1FAE5', color: '#065F46', border: '1px solid #6EE7B7', borderRadius: 20, padding: '2px 10px', letterSpacing: '0.3px' }}>
                PUBLISHED
              </span>
            )}
            <span style={{ fontSize: 11, fontWeight: 600, background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', borderRadius: 20, padding: '2px 10px', letterSpacing: '0.3px' }}>
              v{article.version || '0.1'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
            Updated {fmtDate(article.updated_at)}
          </div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={toggleStatus}
              disabled={toggling}
              style={{
                padding: '6px 14px', fontSize: 13, fontWeight: 600, borderRadius: 7, cursor: toggling ? 'not-allowed' : 'pointer', opacity: toggling ? 0.7 : 1,
                background: isDraft ? '#1E293B' : '#F9FAFB',
                color:      isDraft ? '#fff'    : '#374151',
                border:     isDraft ? 'none'    : '1px solid #E5E7EB',
              }}
            >
              {toggling ? '…' : isDraft ? '🚀 Publish' : '📋 Revert to Draft'}
            </button>
            <button
              onClick={onEdit}
              style={{ padding: '6px 14px', fontSize: 13, fontWeight: 600, background: '#F1F5F9', color: '#1E293B', border: '1px solid #E5E7EB', borderRadius: 7, cursor: 'pointer' }}
            >
              ✏️ Edit
            </button>
            <button
              onClick={onDelete}
              style={{ padding: '6px 14px', fontSize: 13, fontWeight: 600, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 7, cursor: 'pointer' }}
            >
              🗑 Delete
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div
        style={{ padding: '24px', fontSize: 14, lineHeight: 1.75, color: '#1F2937' }}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.content || '<p style="color:#9CA3AF">No content.</p>') }}
      />

      {/* Attachments */}
      {article.files && article.files.length > 0 && (
        <div style={{ borderTop: '1px solid #F3F4F6', padding: '14px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
            Attachments ({article.files.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {article.files.map((f) => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#F9FAFB', borderRadius: 8, border: '1px solid #F3F4F6' }}>
                <span style={{ fontSize: 18 }}>{fileIcon(f.mimetype, f.display_name)}</span>
                <span style={{ flex: 1, fontSize: 13, color: '#374151' }}>{f.display_name}</span>
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtSize(f.size)}</span>
                <a
                  href={api.articleFileDownloadUrl(f.id)}
                  download
                  style={{ fontSize: 12, fontWeight: 600, color: '#1E293B', padding: '4px 10px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 6, textDecoration: 'none' }}
                >
                  ⬇ Download
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Folder tree (left panel) ──────────────────────────────────────────────────

function FolderNode({ node, selectedId, onSelect, level = 0 }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isSelected  = selectedId === node.id;

  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: `5px 10px 5px ${12 + level * 14}px`,
          cursor: 'pointer', borderRadius: 6, marginBottom: 1,
          background: isSelected ? '#EFF6FF' : 'transparent',
          color:      isSelected ? '#1D4ED8' : '#374151',
          fontWeight: isSelected ? 600 : 400,
          fontSize: 13,
        }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <span
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            style={{ fontSize: 9, width: 12, textAlign: 'center', opacity: 0.5 }}
          >
            {expanded ? '▼' : '▶'}
          </span>
        ) : (
          <span style={{ width: 12 }} />
        )}
        <span style={{ fontSize: 15 }}>📁</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
        </span>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <FolderNode key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Create-folder modal ───────────────────────────────────────────────────────

function CreateFolderModal({ parentName, onConfirm, onClose }) {
  const [name, setName] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  function submit(e) {
    e.preventDefault();
    if (name.trim()) onConfirm(name.trim());
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New Folder{parentName ? ` in "${parentName}"` : ''}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Folder name…"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid #D1D5DB', fontSize: 14 }}
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!name.trim()}>Create</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Rename modal ──────────────────────────────────────────────────────────────

function RenameModal({ current, onConfirm, onClose }) {
  const [name, setName] = useState(current);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  function submit(e) {
    e.preventDefault();
    if (name.trim() && name.trim() !== current) onConfirm(name.trim());
    else onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Rename Folder</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid #D1D5DB', fontSize: 14 }}
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Rename</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Confirm delete modal ──────────────────────────────────────────────────────

function ConfirmModal({ message, onConfirm, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Confirm Delete</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body"><p>{message}</p></div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function KnowledgeBasePage({ readOnly = false }) {
  const user  = useUser();
  const toast = useToast();
  const canEdit = !readOnly && (user?.role === 'admin' || user?.role === 'agent');

  const [folders,     setFolders]     = useState([]);
  const [files,       setFiles]       = useState([]);
  const [articles,    setArticles]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [selectedId,  setSelectedId]  = useState(null);
  const [search,      setSearch]      = useState('');

  // Article view states
  // mode: 'grid' | 'editor' | 'viewer'
  const [mode,           setMode]           = useState('grid');
  const [editingArticle, setEditingArticle] = useState(null); // article object or null (new)
  const [viewingArticle, setViewingArticle] = useState(null); // article object with files

  // Modal states
  const [createModal, setCreateModal] = useState(null); // null | { parentId, parentName }
  const [renameModal, setRenameModal] = useState(null); // null | { id, name }
  const [deleteModal, setDeleteModal] = useState(null); // null | { type:'folder'|'file'|'article', id, name }

  const fileInputRef = useRef(null);
  const [uploading,   setUploading]   = useState(false);

  async function load() {
    try {
      const { folders: f, files: fi, articles: a } = await api.getKbTree();
      setFolders(f);
      setFiles(fi);
      setArticles(a || []);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // ── Derived state ──────────────────────────────────────────────────────────
  const tree = buildTree(folders);
  const crumbs = breadcrumb(folders, selectedId);
  const selectedFolder = selectedId ? folders.find((f) => f.id === selectedId) : null;

  // Direct children of the selected folder (or root-level)
  const subfolders = folders.filter((f) =>
    selectedId ? (f.parent_id ?? null) === selectedId : (f.parent_id ?? null) === null
  );

  // Files in selected folder
  const folderFiles = selectedId ? files.filter((f) => f.folder_id === selectedId) : [];

  // Articles in selected folder
  const folderArticles = selectedId ? articles.filter((a) => a.folder_id === selectedId) : [];

  // ── Actions ────────────────────────────────────────────────────────────────

  async function createFolder(name) {
    setCreateModal(null);
    try {
      const folder = await api.createKbFolder({ name, parent_id: createModal.parentId });
      setFolders((prev) => [...prev, folder]);
      setSelectedId(folder.id);
      toast(`Folder "${name}" created`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function renameFolder(name) {
    const id = renameModal.id;
    setRenameModal(null);
    try {
      const updated = await api.renameKbFolder(id, { name });
      setFolders((prev) => prev.map((f) => f.id === id ? updated : f));
      toast('Renamed', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function doDelete() {
    const { type, id } = deleteModal;
    setDeleteModal(null);
    try {
      if (type === 'folder') {
        await api.deleteKbFolder(id);
        setFolders((prev) => prev.filter((f) => f.id !== id));
        setFiles((prev)   => prev.filter((f) => f.folder_id !== id));
        setArticles((prev) => prev.filter((a) => a.folder_id !== id));
        if (selectedId === id) setSelectedId(null);
        toast('Folder deleted', 'success');
      } else if (type === 'file') {
        await api.deleteKbFile(id);
        setFiles((prev) => prev.filter((f) => f.id !== id));
        toast('File deleted', 'success');
      } else if (type === 'article') {
        await api.deleteKbArticle(id);
        setArticles((prev) => prev.filter((a) => a.id !== id));
        toast('Article deleted', 'success');
      }
    } catch (e) { toast(e.message, 'error'); }
  }

  async function handleUpload(e) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !selectedId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of fileList) fd.append('files', f);
      const newFiles = await api.uploadKbFiles(selectedId, fd);
      setFiles((prev) => [...prev, ...newFiles]);
      toast(`${newFiles.length} file${newFiles.length !== 1 ? 's' : ''} uploaded`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function openArticleViewer(article) {
    try {
      const full = await api.getKbArticle(article.id);
      setViewingArticle(full);
      setMode('viewer');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function handleArticleStatusChange(newStatus) {
    if (!viewingArticle) return;
    try {
      const updated = await api.updateKbArticle(viewingArticle.id, {
        title:   viewingArticle.title,
        content: viewingArticle.content,
        status:  newStatus,
      });
      const withFiles = { ...updated, files: viewingArticle.files };
      setViewingArticle(withFiles);
      setArticles((prev) => prev.map((a) => a.id === updated.id ? { ...a, status: updated.status } : a));
      toast(newStatus === 'published' ? 'Article published!' : 'Reverted to draft', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  function openArticleEditor(article = null) {
    setEditingArticle(article);
    setMode('editor');
  }

  function handleArticleSaved(saved) {
    setArticles((prev) => {
      const exists = prev.find((a) => a.id === saved.id);
      if (exists) return prev.map((a) => a.id === saved.id ? { ...a, ...saved } : a);
      return [...prev, saved];
    });
    setViewingArticle(saved);
    setMode('viewer');
  }

  function handleEditorCancel() {
    if (viewingArticle) {
      setMode('viewer');
    } else {
      setMode('grid');
      setEditingArticle(null);
    }
  }

  // Navigate to a folder, resetting article view
  function selectFolder(id) {
    setSelectedId(id);
    setMode('grid');
    setEditingArticle(null);
    setViewingArticle(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="loading"><div className="spinner" /> Loading knowledge base…</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, alignItems: 'flex-start', minHeight: '100%' }}>

      {/* ── Left: folder tree ──────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB',
        padding: '16px 10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '0 4px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Folders</span>
          {canEdit && (
            <button
              onClick={() => setCreateModal({ parentId: null, parentName: null })}
              title="New root folder"
              style={{
                background: '#F1F5F9', color: '#1E293B', border: 'none',
                borderRadius: 5, padding: '3px 8px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
              }}
            >+ New</button>
          )}
        </div>

        {tree.length === 0 ? (
          <div style={{ fontSize: 12, color: '#9CA3AF', padding: '8px 4px' }}>No folders yet.</div>
        ) : (
          tree.map((node) => (
            <FolderNode key={node.id} node={node} selectedId={selectedId} onSelect={selectFolder} />
          ))
        )}
      </div>

      {/* ── Right: content area ────────────────────────────────────────────── */}
      <div style={{ minWidth: 0 }}>

        {/* Article editor */}
        {mode === 'editor' && selectedId && (
          <ArticleEditor
            folderId={selectedId}
            article={editingArticle}
            onSave={handleArticleSaved}
            onCancel={handleEditorCancel}
          />
        )}

        {/* Article viewer */}
        {mode === 'viewer' && viewingArticle && (
          <ArticleViewer
            article={viewingArticle}
            canEdit={canEdit}
            onEdit={() => openArticleEditor(viewingArticle)}
            onDelete={() => setDeleteModal({ type: 'article', id: viewingArticle.id, name: viewingArticle.title })}
            onClose={() => { setMode('grid'); setViewingArticle(null); }}
            onStatusChange={handleArticleStatusChange}
          />
        )}

        {/* Grid view */}
        {mode === 'grid' && <>

          {/* Search bar */}
          <div style={{ position: 'relative', marginBottom: 20 }}>
            <span style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              fontSize: 15, opacity: 0.4, pointerEvents: 'none',
            }}>🔍</span>
            <input
              type="text"
              placeholder="Search folders, files, and articles…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '10px 36px 10px 38px',
                borderRadius: 9, border: '1px solid #E5E7EB',
                fontSize: 14, color: '#111827', background: '#fff',
                outline: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => e.target.style.borderColor = '#93C5FD'}
              onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 13, color: '#9CA3AF', padding: '2px 6px',
                }}
              >✕</button>
            )}
          </div>

          {/* Search results */}
          {search.trim() && (() => {
            const q = search.trim().toLowerCase();
            const matchedFolders  = folders.filter((f) => f.name.toLowerCase().includes(q));
            const matchedFiles    = files.filter((f) => f.display_name.toLowerCase().includes(q));
            const matchedArticles = articles.filter((a) => a.title.toLowerCase().includes(q));
            const total = matchedFolders.length + matchedFiles.length + matchedArticles.length;
            return (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 14 }}>
                  {total} result{total !== 1 ? 's' : ''} for "{search.trim()}"
                </div>
                {total === 0 ? (
                  <div style={{
                    background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB',
                    padding: '40px 24px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>🔍</div>
                    <div style={{ fontSize: 14, color: '#9CA3AF' }}>No results match your search.</div>
                  </div>
                ) : (
                  <FolderGrid
                    folders={matchedFolders}
                    files={matchedFiles}
                    articles={matchedArticles}
                    onOpenFolder={(id) => { setSelectedId(id); setSearch(''); }}
                    onOpenArticle={openArticleViewer}
                    onRename={canEdit ? (f) => setRenameModal({ id: f.id, name: f.name }) : null}
                    onDeleteFolder={canEdit ? (f) => setDeleteModal({ type: 'folder', id: f.id, name: f.name }) : null}
                    onDeleteFile={canEdit  ? (f) => setDeleteModal({ type: 'file',   id: f.id, name: f.display_name }) : null}
                    onDeleteArticle={canEdit ? (a) => setDeleteModal({ type: 'article', id: a.id, name: a.title }) : null}
                    readOnly={readOnly}
                  />
                )}
              </div>
            );
          })()}

          {/* Normal tree view — hidden while searching */}
          {!search.trim() && <>

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, fontSize: 13, color: '#6B7280', flexWrap: 'wrap' }}>
            <span
              style={{ cursor: 'pointer', color: selectedId ? '#1E293B' : '#111827', fontWeight: selectedId ? 400 : 600 }}
              onClick={() => selectFolder(null)}
            >
              Knowledge Base
            </span>
            {crumbs.map((f, i) => (
              <span key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ opacity: 0.4 }}>›</span>
                <span
                  style={{
                    cursor: 'pointer',
                    color: i === crumbs.length - 1 ? '#111827' : '#1E293B',
                    fontWeight: i === crumbs.length - 1 ? 600 : 400,
                  }}
                  onClick={() => selectFolder(f.id)}
                >
                  {f.name}
                </span>
              </span>
            ))}
          </div>

          {/* Action bar */}
          {canEdit && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <button
                onClick={() => setCreateModal({
                  parentId:   selectedId,
                  parentName: selectedFolder?.name ?? null,
                })}
                style={{
                  padding: '7px 14px', fontSize: 13, fontWeight: 600,
                  background: '#F9FAFB', color: '#374151',
                  border: '1px solid #E5E7EB', borderRadius: 7, cursor: 'pointer',
                }}
              >
                📁 New Folder
              </button>
              {selectedId && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    style={{
                      padding: '7px 14px', fontSize: 13, fontWeight: 600,
                      background: '#F9FAFB', color: '#374151',
                      border: '1px solid #E5E7EB', borderRadius: 7, cursor: uploading ? 'not-allowed' : 'pointer',
                      opacity: uploading ? 0.7 : 1,
                    }}
                  >
                    {uploading ? '⏳ Uploading…' : '⬆ Upload Files'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handleUpload}
                    accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.png,.jpg,.jpeg,.gif,.zip,.txt"
                  />
                  <button
                    onClick={() => openArticleEditor(null)}
                    style={{
                      padding: '7px 14px', fontSize: 13, fontWeight: 600,
                      background: '#1E293B', color: '#fff',
                      border: 'none', borderRadius: 7, cursor: 'pointer',
                    }}
                  >
                    ✍️ Write Article
                  </button>
                </>
              )}
            </div>
          )}

          {/* Root landing — no folder selected */}
          {!selectedId && (
            <>
              {subfolders.length === 0 ? (
                <div style={{
                  background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB',
                  padding: '64px 24px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                    {canEdit ? 'Create your first folder to get started' : 'The knowledge base is empty'}
                  </div>
                  {canEdit && (
                    <div style={{ fontSize: 13, color: '#9CA3AF' }}>
                      Click "+ New" in the folder panel or the "New Folder" button above.
                    </div>
                  )}
                </div>
              ) : (
                <FolderGrid
                  folders={subfolders}
                  files={[]}
                  articles={[]}
                  onOpenFolder={selectFolder}
                  onOpenArticle={openArticleViewer}
                  onRename={canEdit ? (f) => setRenameModal({ id: f.id, name: f.name }) : null}
                  onDeleteFolder={canEdit ? (f) => setDeleteModal({ type: 'folder', id: f.id, name: f.name }) : null}
                  onDeleteFile={null}
                  onDeleteArticle={null}
                  readOnly={readOnly}
                />
              )}
            </>
          )}

          {/* Inside a folder */}
          {selectedId && (
            <FolderGrid
              folders={subfolders}
              files={folderFiles}
              articles={folderArticles}
              onOpenFolder={selectFolder}
              onOpenArticle={openArticleViewer}
              onRename={canEdit ? (f) => setRenameModal({ id: f.id, name: f.name }) : null}
              onDeleteFolder={canEdit ? (f) => setDeleteModal({ type: 'folder', id: f.id, name: f.name }) : null}
              onDeleteFile={canEdit  ? (f) => setDeleteModal({ type: 'file',   id: f.id, name: f.display_name }) : null}
              onDeleteArticle={canEdit ? (a) => setDeleteModal({ type: 'article', id: a.id, name: a.title }) : null}
              readOnly={readOnly}
            />
          )}

          </>} {/* end !search.trim() */}

        </>} {/* end mode === 'grid' */}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {createModal && (
        <CreateFolderModal
          parentName={createModal.parentName}
          onConfirm={createFolder}
          onClose={() => setCreateModal(null)}
        />
      )}
      {renameModal && (
        <RenameModal
          current={renameModal.name}
          onConfirm={renameFolder}
          onClose={() => setRenameModal(null)}
        />
      )}
      {deleteModal && (
        <ConfirmModal
          message={
            deleteModal.type === 'folder'
              ? `Delete folder "${deleteModal.name}" and all its contents? This cannot be undone.`
              : deleteModal.type === 'article'
              ? `Delete article "${deleteModal.name}"? This cannot be undone.`
              : `Delete file "${deleteModal.name}"? This cannot be undone.`
          }
          onConfirm={doDelete}
          onClose={() => setDeleteModal(null)}
        />
      )}
    </div>
  );
}

// ── FolderGrid: subfolders + files + articles for the current location ────────

function FolderGrid({ folders, files, articles = [], onOpenFolder, onOpenArticle, onRename, onDeleteFolder, onDeleteFile, onDeleteArticle, readOnly }) {
  return (
    <div>
      {/* Subfolders */}
      {folders.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
            Folders ({folders.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
            {folders.map((f) => (
              <FolderCard
                key={f.id}
                folder={f}
                onOpen={() => onOpenFolder(f.id)}
                onRename={onRename ? () => onRename(f) : null}
                onDelete={onDeleteFolder ? () => onDeleteFolder(f) : null}
              />
            ))}
          </div>
        </div>
      )}

      {/* Articles */}
      {articles.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
            Articles ({articles.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {articles.map((a) => (
              <ArticleCard
                key={a.id}
                article={a}
                onOpen={() => onOpenArticle(a)}
                onDelete={onDeleteArticle ? () => onDeleteArticle(a) : null}
              />
            ))}
          </div>
        </div>
      )}

      {/* Files */}
      {files.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
            Files ({files.length})
          </div>
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            {files.map((f, i) => (
              <FileRow
                key={f.id}
                file={f}
                isLast={i === files.length - 1}
                onDelete={onDeleteFile ? () => onDeleteFile(f) : null}
              />
            ))}
          </div>
        </div>
      )}

      {folders.length === 0 && files.length === 0 && articles.length === 0 && (
        <div style={{
          background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB',
          padding: '40px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>📂</div>
          <div style={{ fontSize: 14, color: '#9CA3AF' }}>
            {readOnly ? 'This folder is empty.' : 'This folder is empty. Upload files, create subfolders, or write an article.'}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Article card ──────────────────────────────────────────────────────────────

function ArticleCard({ article, onOpen, onDelete }) {
  const isDraft = article.status !== 'published';

  // Strip HTML for preview text
  const preview = article.content
    ? article.content.replace(/<[^>]*>/g, '').slice(0, 100).trim()
    : '';

  return (
    <div
      onClick={onOpen}
      style={{
        background: isDraft ? '#FFFBEB' : '#F0FDF4',
        border: `1px solid ${isDraft ? '#FDE68A' : '#BBF7D0'}`,
        borderRadius: 12,
        padding: '20px 18px', cursor: 'pointer', position: 'relative',
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 28 }}>📄</span>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0, marginTop: 4 }}>
          {isDraft && (
            <span style={{ fontSize: 10, fontWeight: 700, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 20, padding: '2px 8px', letterSpacing: '0.3px' }}>
              DRAFT
            </span>
          )}
          <span style={{ fontSize: 10, fontWeight: 600, background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', borderRadius: 20, padding: '2px 7px', letterSpacing: '0.3px' }}>
            v{article.version || '0.1'}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: isDraft ? '#92400E' : '#166534', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {article.title}
      </div>
      {preview && (
        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {preview}
        </div>
      )}
      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>{fmtDate(article.updated_at)}</div>

      {onDelete && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', bottom: 10, right: 10 }}>
          <button
            onClick={onDelete}
            title="Delete article"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '2px 4px', borderRadius: 4, color: '#9CA3AF' }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#DC2626'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#9CA3AF'}
          >🗑</button>
        </div>
      )}
    </div>
  );
}

// ── Folder card ───────────────────────────────────────────────────────────────

function FolderCard({ folder, onOpen, onRename, onDelete }) {
  return (
    <div
      onClick={onOpen}
      style={{
        background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12,
        padding: '20px 18px', cursor: 'pointer', position: 'relative',
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ fontSize: 32, marginBottom: 10 }}>📁</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {folder.name}
      </div>
      <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{fmtDate(folder.created_at)}</div>

      {(onRename || onDelete) && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}
        >
          {onRename && (
            <button
              onClick={onRename}
              title="Rename"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '2px 4px', borderRadius: 4, color: '#9CA3AF' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#374151'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#9CA3AF'}
            >✏️</button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              title="Delete folder"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '2px 4px', borderRadius: 4, color: '#9CA3AF' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#DC2626'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#9CA3AF'}
            >🗑</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── File row ──────────────────────────────────────────────────────────────────

function FileRow({ file, isLast, onDelete }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 16px',
      borderBottom: isLast ? 'none' : '1px solid #F3F4F6',
    }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>{fileIcon(file.mimetype, file.display_name)}</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.display_name}
        </div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
          {fmtSize(file.size)} · {fmtDate(file.created_at)}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <a
          href={api.kbDownloadUrl(file.id)}
          download
          style={{
            padding: '5px 12px', fontSize: 12, fontWeight: 600,
            background: '#F1F5F9', color: '#1E293B',
            border: '1px solid #BFDBFE', borderRadius: 6,
            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          ⬇ Download
        </a>
        {onDelete && (
          <button
            onClick={onDelete}
            title="Delete file"
            style={{
              background: 'none', border: '1px solid #FCA5A5', borderRadius: 6,
              color: '#DC2626', fontSize: 12, padding: '5px 10px', cursor: 'pointer',
            }}
          >
            🗑
          </button>
        )}
      </div>
    </div>
  );
}
