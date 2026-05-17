const express  = require('express');
const router   = express.Router();
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');
const db       = require('../db');
const adminOnly   = require('../middleware/adminOnly');
const staffOnly   = require('../middleware/staffOnly');
const handleError = require('../middleware/handleError');

// ── Upload config ─────────────────────────────────────────────────────────────
const ATTACH_DIR = path.join(__dirname, '..', 'uploads', 'deployment_attachments');
if (!fs.existsSync(ATTACH_DIR)) fs.mkdirSync(ATTACH_DIR, { recursive: true });

const attachStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ATTACH_DIR),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.originalname}`),
});
const deployFileFilter = (req, file, cb) => {
  const allowed = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'text/plain', 'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip', 'application/x-zip-compressed',
  ];
  cb(null, allowed.includes(file.mimetype));
};
const uploadAttach = multer({ storage: attachStorage, limits: { fileSize: 50 * 1024 * 1024 }, fileFilter: deployFileFilter });

// ── Validate :id ──────────────────────────────────────────────────────────────
router.param('id', (req, res, next, val) => {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'Invalid ID' });
  next();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function enrichDeployment(d) {
  if (!d) return d;
  // Attach customer name
  if (d.customer_id) {
    const cust = db.prepare('SELECT id, name FROM customers WHERE id = ?').get(d.customer_id);
    d.customer_name = cust?.name || null;
  } else {
    d.customer_name = null;
  }
  // Attach assigned user name
  if (d.assigned_to) {
    const usr = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(d.assigned_to);
    d.assigned_user = usr || null;
  } else {
    d.assigned_user = null;
  }
  // Attach attachments
  d.attachments = db.prepare(
    'SELECT * FROM deployment_attachments WHERE deployment_id = ? ORDER BY created_at ASC'
  ).all(d.id);
  return d;
}

// ── GET / ─────────────────────────────────────────────────────────────────────
// ?product_id=xxx  optional filter
router.get('/', (req, res) => {
  try {
    const { product_id } = req.query;
    const rows = product_id
      ? db.prepare('SELECT * FROM deployments WHERE product_id = ? ORDER BY created_at DESC').all(product_id)
      : db.prepare('SELECT * FROM deployments ORDER BY created_at DESC').all();
    res.json(rows.map(enrichDeployment));
  } catch (e) { return handleError(res, e); }
});

// ── POST / ────────────────────────────────────────────────────────────────────
router.post('/', adminOnly, (req, res) => {
  const { product_id, product_name, customer_id, environment, version, status, assigned_to, deployed_at, notes } = req.body;
  if (!product_id?.trim()) return res.status(400).json({ error: 'product_id is required' });
  if (!environment?.trim()) return res.status(400).json({ error: 'environment is required' });
  const now = new Date().toISOString();
  try {
    const result = db.prepare(`
      INSERT INTO deployments (product_id, product_name, customer_id, environment, version, status, assigned_to, deployed_at, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      product_id.trim(),
      product_name?.trim() || '',
      customer_id || null,
      environment.trim(),
      version?.trim() || '',
      status || 'Planned',
      assigned_to || null,
      deployed_at || null,
      notes?.trim() || '',
      now, now
    );
    const dep = db.prepare('SELECT * FROM deployments WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(enrichDeployment(dep));
  } catch (e) { return handleError(res, e); }
});

// ── PUT /:id ──────────────────────────────────────────────────────────────────
router.put('/:id', adminOnly, (req, res) => {
  const { product_id, product_name, customer_id, environment, version, status, assigned_to, deployed_at, notes } = req.body;
  const now = new Date().toISOString();
  try {
    const info = db.prepare(`
      UPDATE deployments SET
        product_id = ?, product_name = ?, customer_id = ?, environment = ?,
        version = ?, status = ?, assigned_to = ?, deployed_at = ?,
        notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      product_id?.trim() || '',
      product_name?.trim() || '',
      customer_id || null,
      environment?.trim() || 'Production',
      version?.trim() || '',
      status || 'Planned',
      assigned_to || null,
      deployed_at || null,
      notes?.trim() || '',
      now,
      req.params.id
    );
    if (info.changes === 0) return res.status(404).json({ error: 'Deployment not found' });
    const dep = db.prepare('SELECT * FROM deployments WHERE id = ?').get(req.params.id);
    res.json(enrichDeployment(dep));
  } catch (e) { return handleError(res, e); }
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────
router.delete('/:id', adminOnly, (req, res) => {
  try {
    const dep = db.prepare('SELECT id FROM deployments WHERE id = ?').get(req.params.id);
    if (!dep) return res.status(404).json({ error: 'Deployment not found' });
    // Delete attachment files from disk
    const atts = db.prepare('SELECT filename FROM deployment_attachments WHERE deployment_id = ?').all(req.params.id);
    for (const att of atts) {
      try { fs.unlinkSync(path.join(ATTACH_DIR, att.filename)); } catch (_) {}
    }
    db.prepare('DELETE FROM deployment_attachments WHERE deployment_id = ?').run(req.params.id);
    db.prepare('DELETE FROM deployments WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e) { return handleError(res, e); }
});

// ── POST /:id/attachments ─────────────────────────────────────────────────────
router.post('/:id/attachments', staffOnly, uploadAttach.array('files', 10), (req, res) => {
  const depId = Number(req.params.id);
  const dep = db.prepare('SELECT id FROM deployments WHERE id = ?').get(depId);
  if (!dep) return res.status(404).json({ error: 'Deployment not found' });
  // Use authenticated user identity — never trust body for uploaded_by (H2)
  const uploadedBy = req.user?.email || req.user?.name || 'Agent';
  const now = new Date().toISOString();
  const inserted = [];
  for (const file of req.files || []) {
    const result = db.prepare(`
      INSERT INTO deployment_attachments (deployment_id, display_name, filename, original_name, mimetype, size, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(depId, file.originalname, file.filename, file.originalname, file.mimetype, file.size, uploadedBy, now);
    inserted.push(db.prepare('SELECT * FROM deployment_attachments WHERE id = ?').get(result.lastInsertRowid));
  }
  res.status(201).json(inserted);
});

// ── GET /attachments/:id/download ─────────────────────────────────────────────
router.get('/attachments/:id/download', staffOnly, (req, res) => {
  try {
    const att = db.prepare('SELECT * FROM deployment_attachments WHERE id = ?').get(req.params.id);
    if (!att) return res.status(404).json({ error: 'Attachment not found' });
    // Prevent path traversal
    const resolved = path.resolve(ATTACH_DIR, att.filename);
    if (!resolved.startsWith(path.resolve(ATTACH_DIR) + path.sep)) {
      return res.status(400).json({ error: 'Invalid attachment' });
    }
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'File not found on disk' });
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.original_name)}"`);
    res.setHeader('Content-Type', att.mimetype || 'application/octet-stream');
    res.sendFile(resolved);
  } catch (e) { return handleError(res, e); }
});

// ── DELETE /attachments/:id ───────────────────────────────────────────────────
router.delete('/attachments/:id', adminOnly, (req, res) => {
  try {
    const att = db.prepare('SELECT * FROM deployment_attachments WHERE id = ?').get(req.params.id);
    if (!att) return res.status(404).json({ error: 'Attachment not found' });
    try { fs.unlinkSync(path.join(ATTACH_DIR, att.filename)); } catch (_) {}
    db.prepare('DELETE FROM deployment_attachments WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e) { return handleError(res, e); }
});

module.exports = router;
