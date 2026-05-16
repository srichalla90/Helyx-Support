const express      = require('express');
const router       = express.Router();
const db           = require('../db');
const multer       = require('multer');
const path         = require('path');
const fs           = require('fs');
const requireAuth  = require('../middleware/requireAuth');
const adminOnly    = require('../middleware/adminOnly');
const handleError   = require('../middleware/handleError');

// Only admins may write
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'downloads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } }); // 200 MB

const now = () => new Date().toISOString();

// ── GET /api/downloads — public list of active downloads ─────────────────────
router.get('/', (req, res) => {
  try {
    const { category, product } = req.query;
    let sql = `SELECT id, title, description, category, product, version, file_type, file_size, is_external, is_active, url, filename, position, created_at
               FROM downloads WHERE is_active = 1`;
    const params = [];
    if (category?.trim()) { sql += ` AND category = ?`; params.push(category.trim()); }
    if (product?.trim())  { sql += ` AND product = ?`;  params.push(product.trim()); }
    sql += ` ORDER BY position ASC, created_at DESC`;
    res.json(db.prepare(sql).all(...params));
  } catch (e) { return handleError(res, e); }
});

// ── GET /api/downloads/all — admin: include inactive ──────────────────────────
router.get('/all', requireAuth, adminOnly, (req, res) => {
  try {
    res.json(db.prepare(`SELECT * FROM downloads ORDER BY position ASC, created_at DESC`).all());
  } catch (e) { return handleError(res, e); }
});

// ── POST /api/downloads — admin: create (JSON or multipart) ──────────────────
router.post('/', requireAuth, adminOnly, upload.single('file'), (req, res) => {
  try {
    const { title, description = '', category = 'General', product = '', version = '', file_type = '', is_external = '0', url = '', position = 0 } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

    let finalUrl = url;
    let filename = '';
    let fileSize = req.body.file_size || '';
    let fileType = file_type;
    let isExternal = parseInt(is_external, 10);

    if (req.file) {
      // Uploaded file
      finalUrl    = `/api/downloads/file/${req.file.filename}`;
      filename    = req.file.originalname;
      fileSize    = formatBytes(req.file.size);
      fileType    = fileType || path.extname(req.file.originalname).replace('.', '').toUpperCase();
      isExternal  = 0;
    } else if (!url?.trim() && !req.file) {
      return res.status(400).json({ error: 'Either a file upload or an external URL is required' });
    }

    const ts = now();
    const result = db.prepare(
      `INSERT INTO downloads (title, description, category, product, version, file_type, file_size, url, filename, is_external, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(title.trim(), description, category, product, version, fileType, fileSize, finalUrl, filename, isExternal, Number(position), ts, ts);
    res.status(201).json(db.prepare(`SELECT * FROM downloads WHERE id = ?`).get(result.lastInsertRowid));
  } catch (e) { return handleError(res, e); }
});

// ── PUT /api/downloads/:id — admin: update metadata ───────────────────────────
router.put('/:id', requireAuth, adminOnly, (req, res) => {
  try {
    const { title, description, category, product, version, file_type, is_active, position, url, file_size } = req.body;
    const existing = db.prepare(`SELECT * FROM downloads WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const ts = now();
    db.prepare(
      `UPDATE downloads SET title=?, description=?, category=?, product=?, version=?, file_type=?, file_size=?, url=?, is_active=?, position=?, updated_at=? WHERE id=?`
    ).run(
      title ?? existing.title,
      description ?? existing.description,
      category    ?? existing.category,
      product     ?? existing.product,
      version     ?? existing.version,
      file_type   ?? existing.file_type,
      file_size   ?? existing.file_size,
      url         ?? existing.url,
      is_active != null ? Number(is_active) : existing.is_active,
      position    != null ? Number(position) : existing.position,
      ts, req.params.id
    );
    res.json(db.prepare(`SELECT * FROM downloads WHERE id = ?`).get(req.params.id));
  } catch (e) { return handleError(res, e); }
});

// ── DELETE /api/downloads/:id — admin ─────────────────────────────────────────
router.delete('/:id', requireAuth, adminOnly, (req, res) => {
  try {
    const existing = db.prepare(`SELECT * FROM downloads WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    // Remove local file if stored on disk
    if (!existing.is_external && existing.url?.startsWith('/api/downloads/file/')) {
      const fname = existing.url.replace('/api/downloads/file/', '');
      try { fs.unlinkSync(path.join(UPLOAD_DIR, fname)); } catch (_) {}
    }
    db.prepare(`DELETE FROM downloads WHERE id = ?`).run(req.params.id);
    res.json({ success: true });
  } catch (e) { return handleError(res, e); }
});

// ── GET /api/downloads/file/:filename — serve uploaded file ───────────────────
router.get('/file/:filename', (req, res) => {
  try {
    const filePath = path.join(UPLOAD_DIR, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.download(filePath);
  } catch (e) { return handleError(res, e); }
});

function formatBytes(bytes) {
  if (bytes < 1024)           return `${bytes} B`;
  if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

module.exports = router;
