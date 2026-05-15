/**
 * kb.js — Knowledge Base routes
 *
 *  GET    /api/kb/tree                        — full folder + file tree
 *  POST   /api/kb/folders                     — create folder
 *  PUT    /api/kb/folders/:id                 — rename folder
 *  DELETE /api/kb/folders/:id                 — delete folder (+ all children + files)
 *  POST   /api/kb/folders/:id/files           — upload files (multipart)
 *  DELETE /api/kb/files/:id                   — delete a file
 *  GET    /api/kb/files/:id/download          — download a file
 *
 *  POST   /api/kb/articles                    — create article { folder_id, title, content }
 *  GET    /api/kb/articles/:id                — get single article with its attachment files
 *  PUT    /api/kb/articles/:id                — update article { title, content }
 *  DELETE /api/kb/articles/:id                — delete article + disk files
 *  POST   /api/kb/articles/:id/files          — attach files to article (multipart)
 *  DELETE /api/kb/article-files/:id           — delete an article attachment
 *  GET    /api/kb/article-files/:id/download  — download an article attachment
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const UPLOAD_DIR         = path.join(__dirname, '..', 'uploads', 'kb');
const ARTICLE_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'kb_articles');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(ARTICLE_UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file,  cb) => {
    const ext  = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50 MB cap

const articleStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ARTICLE_UPLOAD_DIR),
  filename:    (_req, file,  cb) => {
    const ext  = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  },
});
const uploadArticle = multer({ storage: articleStorage, limits: { fileSize: 50 * 1024 * 1024 } });

function now() { return new Date().toISOString(); }

// Recursively collect all descendant folder IDs (inclusive of root)
function allDescendantIds(rootId) {
  const children = db.prepare('SELECT id FROM kb_folders WHERE parent_id = ?').all(rootId);
  let ids = [rootId];
  for (const c of children) ids = ids.concat(allDescendantIds(c.id));
  return ids;
}

// ── GET /api/kb/tree ──────────────────────────────────────────────────────────
router.get('/tree', (_req, res) => {
  try {
    const folders  = db.prepare('SELECT * FROM kb_folders  ORDER BY name ASC').all();
    const files    = db.prepare('SELECT * FROM kb_files    ORDER BY display_name ASC').all();
    const articles = db.prepare('SELECT * FROM kb_articles ORDER BY title ASC').all();
    res.json({ folders, files, articles });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/kb/folders ──────────────────────────────────────────────────────
router.post('/folders', (req, res) => {
  const { name, parent_id } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Folder name is required' });
  try {
    const result = db.prepare(
      `INSERT INTO kb_folders (name, parent_id, created_at) VALUES (?, ?, ?)`
    ).run(name.trim(), parent_id || null, now());
    res.status(201).json(db.prepare('SELECT * FROM kb_folders WHERE id = ?').get(result.lastInsertRowid));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /api/kb/folders/:id ───────────────────────────────────────────────────
router.put('/folders/:id', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Folder name is required' });
  const id = Number(req.params.id);
  try {
    db.prepare('UPDATE kb_folders SET name = ? WHERE id = ?').run(name.trim(), id);
    const folder = db.prepare('SELECT * FROM kb_folders WHERE id = ?').get(id);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });
    res.json(folder);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/kb/folders/:id ────────────────────────────────────────────────
router.delete('/folders/:id', (req, res) => {
  const id = Number(req.params.id);
  try {
    const ids = allDescendantIds(id);
    // Remove files from disk and DB for every affected folder
    for (const fid of ids) {
      const files = db.prepare('SELECT filename FROM kb_files WHERE folder_id = ?').all(fid);
      for (const f of files) {
        try { fs.unlinkSync(path.join(UPLOAD_DIR, f.filename)); } catch (_) {}
      }
      db.prepare('DELETE FROM kb_files   WHERE folder_id = ?').run(fid);
    }
    // Delete folders deepest-first to satisfy any FK constraints
    for (const fid of ids.reverse()) {
      db.prepare('DELETE FROM kb_folders WHERE id = ?').run(fid);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/kb/folders/:id/files ───────────────────────────────────────────
router.post('/folders/:id/files', upload.array('files', 20), (req, res) => {
  const folderId = Number(req.params.id);
  try {
    const inserted = [];
    for (const file of req.files || []) {
      const result = db.prepare(`
        INSERT INTO kb_files (folder_id, display_name, filename, original_name, mimetype, size, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(folderId, file.originalname, file.filename, file.originalname, file.mimetype, file.size, now());
      inserted.push(db.prepare('SELECT * FROM kb_files WHERE id = ?').get(result.lastInsertRowid));
    }
    res.status(201).json(inserted);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/kb/files/:id ──────────────────────────────────────────────────
router.delete('/files/:id', (req, res) => {
  const id = Number(req.params.id);
  try {
    const file = db.prepare('SELECT * FROM kb_files WHERE id = ?').get(id);
    if (!file) return res.status(404).json({ error: 'File not found' });
    try { fs.unlinkSync(path.join(UPLOAD_DIR, file.filename)); } catch (_) {}
    db.prepare('DELETE FROM kb_files WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/kb/files/:id/download ───────────────────────────────────────────
router.get('/files/:id/download', (req, res) => {
  const id = Number(req.params.id);
  try {
    const file = db.prepare('SELECT * FROM kb_files WHERE id = ?').get(id);
    if (!file) return res.status(404).json({ error: 'File not found' });
    const filePath = path.join(UPLOAD_DIR, file.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing on disk' });
    res.download(filePath, file.original_name || file.display_name);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/kb/articles ─────────────────────────────────────────────────────
router.post('/articles', (req, res) => {
  const { folder_id, title, content = '', status = 'draft' } = req.body;
  if (!folder_id) return res.status(400).json({ error: 'folder_id is required' });
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  const safeStatus = status === 'published' ? 'published' : 'draft';
  try {
    const ts = now();
    const result = db.prepare(
      `INSERT INTO kb_articles (folder_id, title, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(Number(folder_id), title.trim(), content, safeStatus, ts, ts);
    const article = db.prepare('SELECT * FROM kb_articles WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ ...article, files: [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/kb/articles/:id ──────────────────────────────────────────────────
router.get('/articles/:id', (req, res) => {
  const id = Number(req.params.id);
  try {
    const article = db.prepare('SELECT * FROM kb_articles WHERE id = ?').get(id);
    if (!article) return res.status(404).json({ error: 'Article not found' });
    const files = db.prepare('SELECT * FROM kb_article_files WHERE article_id = ? ORDER BY created_at ASC').all(id);
    res.json({ ...article, files });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /api/kb/articles/:id ──────────────────────────────────────────────────
router.put('/articles/:id', (req, res) => {
  const id = Number(req.params.id);
  const { title, content, status } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  const safeStatus = status === 'published' ? 'published' : 'draft';
  try {
    db.prepare(
      `UPDATE kb_articles SET title = ?, content = ?, status = ?, updated_at = ? WHERE id = ?`
    ).run(title.trim(), content ?? '', safeStatus, now(), id);
    const article = db.prepare('SELECT * FROM kb_articles WHERE id = ?').get(id);
    if (!article) return res.status(404).json({ error: 'Article not found' });
    const files = db.prepare('SELECT * FROM kb_article_files WHERE article_id = ? ORDER BY created_at ASC').all(id);
    res.json({ ...article, files });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/kb/articles/:id ───────────────────────────────────────────────
router.delete('/articles/:id', (req, res) => {
  const id = Number(req.params.id);
  try {
    const article = db.prepare('SELECT * FROM kb_articles WHERE id = ?').get(id);
    if (!article) return res.status(404).json({ error: 'Article not found' });
    // Delete all attachment files from disk
    const files = db.prepare('SELECT * FROM kb_article_files WHERE article_id = ?').all(id);
    for (const f of files) {
      try { fs.unlinkSync(path.join(ARTICLE_UPLOAD_DIR, f.filename)); } catch (_) {}
    }
    db.prepare('DELETE FROM kb_article_files WHERE article_id = ?').run(id);
    db.prepare('DELETE FROM kb_articles WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/kb/articles/:id/files ──────────────────────────────────────────
router.post('/articles/:id/files', uploadArticle.array('files', 20), (req, res) => {
  const articleId = Number(req.params.id);
  try {
    const inserted = [];
    for (const file of req.files || []) {
      const result = db.prepare(`
        INSERT INTO kb_article_files (article_id, display_name, filename, original_name, mimetype, size, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(articleId, file.originalname, file.filename, file.originalname, file.mimetype, file.size, now());
      inserted.push(db.prepare('SELECT * FROM kb_article_files WHERE id = ?').get(result.lastInsertRowid));
    }
    res.status(201).json(inserted);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/kb/article-files/:id ─────────────────────────────────────────
router.delete('/article-files/:id', (req, res) => {
  const id = Number(req.params.id);
  try {
    const file = db.prepare('SELECT * FROM kb_article_files WHERE id = ?').get(id);
    if (!file) return res.status(404).json({ error: 'File not found' });
    try { fs.unlinkSync(path.join(ARTICLE_UPLOAD_DIR, file.filename)); } catch (_) {}
    db.prepare('DELETE FROM kb_article_files WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/kb/article-files/:id/download ───────────────────────────────────
router.get('/article-files/:id/download', (req, res) => {
  const id = Number(req.params.id);
  try {
    const file = db.prepare('SELECT * FROM kb_article_files WHERE id = ?').get(id);
    if (!file) return res.status(404).json({ error: 'File not found' });
    const filePath = path.join(ARTICLE_UPLOAD_DIR, file.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing on disk' });
    res.download(filePath, file.original_name || file.display_name);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
