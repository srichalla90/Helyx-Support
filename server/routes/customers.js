const express = require('express');
const router  = express.Router();
const db      = require('../db');
const adminOnly  = require('../middleware/adminOnly');
const handleError = require('../middleware/handleError');

const LIFECYCLE_STATUSES = ['Potential', 'Discussion', 'Demo', 'Pilot', 'Contract', 'Onboarding', 'Active', 'Inactive', 'Declined'];

const CUSTOMER_FIELDS = ['name', 'lifecycle_status', 'contacts', 'industry', 'website', 'phone', 'country', 'account_manager', 'notes'];

function pickFields(body) {
  const out = {};
  for (const f of CUSTOMER_FIELDS) {
    if (body[f] !== undefined) {
      out[f] = f === 'contacts'
        ? (typeof body[f] === 'string' ? body[f] : JSON.stringify(body[f] || []))
        : String(body[f] ?? '');
    }
  }
  return out;
}

// Validate numeric :id params
router.param('id', (req, res, next, val) => {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'Invalid ID' });
  next();
});

// ── GET / ─────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const customers = db.prepare('SELECT * FROM customers ORDER BY name').all();
    res.json(customers.map(parseCustomer));
  } catch (e) { return handleError(res, e); }
});

// ── POST / ───────────────────────────────────────────────────────────────────
router.post('/', adminOnly, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const fields = pickFields(req.body);
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  try {
    const result = db.prepare(
      `INSERT INTO customers (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
    ).run(...vals);
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(parseCustomer(customer));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Customer already exists' });
    return handleError(res, e);
  }
});

// ── PUT /:id ─────────────────────────────────────────────────────────────────
router.put('/:id', adminOnly, (req, res) => {
  const { name } = req.body;
  if (name !== undefined && !name?.trim()) return res.status(400).json({ error: 'Name cannot be empty' });
  const fields = pickFields(req.body);
  if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'Nothing to update' });
  const setClause = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  try {
    const info = db.prepare(`UPDATE customers SET ${setClause} WHERE id = ?`).run(...Object.values(fields), req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Customer not found' });
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    res.json(parseCustomer(customer));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Customer name already exists' });
    return handleError(res, e);
  }
});

// ── PATCH /:id/status ────────────────────────────────────────────────────────
router.patch('/:id/status', adminOnly, (req, res) => {
  const { active } = req.body;
  if (active === undefined) return res.status(400).json({ error: 'active is required' });
  try {
    const info = db.prepare('UPDATE customers SET active = ? WHERE id = ?').run(active ? 1 : 0, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Customer not found' });
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    res.json(parseCustomer(customer));
  } catch (e) { return handleError(res, e); }
});

// ── POST /bulk-import ─────────────────────────────────────────────────────────
router.post('/bulk-import', adminOnly, (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'rows array is required' });
  const inserted = [], skipped = [], errors = [];
  const insertStmt = db.prepare(
    `INSERT INTO customers (name, lifecycle_status, contacts, industry, website, phone, country, account_manager, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(name) DO NOTHING`
  );
  for (const row of rows) {
    if (!row.name?.trim()) { skipped.push({ row, reason: 'Missing name' }); continue; }
    try {
      const result = insertStmt.run(
        row.name.trim(),
        LIFECYCLE_STATUSES.includes(row.lifecycle_status) ? row.lifecycle_status : 'Potential',
        typeof row.contacts === 'string' ? row.contacts : JSON.stringify(row.contacts || []),
        row.industry || '', row.website || '', row.phone || '',
        row.country || '', row.account_manager || '', row.notes || ''
      );
      if (result.changes > 0) inserted.push(row.name.trim());
      else skipped.push({ row, reason: 'Duplicate name' });
    } catch (e) { errors.push({ row, reason: e.message }); }
  }
  res.json({ inserted: inserted.length, skipped: skipped.length, errors: errors.length, details: { inserted, skipped, errors } });
});

// ── DELETE /:id ──────────────────────────────────────────────────────────────
router.delete('/:id', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  try {
    const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Customer not found' });
    db.prepare('UPDATE tickets SET customer_id = NULL WHERE customer_id = ?').run(id);
    db.prepare('DELETE FROM customers WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (e) { return handleError(res, e); }
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseCustomer(c) {
  try { c.contacts = JSON.parse(c.contacts || '[]'); } catch { c.contacts = []; }
  return c;
}

module.exports = router;
