const express = require('express');
const router  = express.Router();
const db      = require('../db');
const adminOnly    = require('../middleware/adminOnly');
const handleError   = require('../middleware/handleError');

// GET /api/ticket-templates — all roles
router.get('/', (req, res) => {
  try {
    const templates = db.prepare(`SELECT * FROM ticket_templates ORDER BY position ASC, created_at ASC`).all();
    res.json(templates);
  } catch (e) { return handleError(res, e); }
});

// POST /api/ticket-templates — admin only
router.post('/', adminOnly, (req, res) => {
  try {
    const { name, description = '', icon = '📋', type = '', product = '', priority = 'Medium', body = '', position = 0 } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const now = new Date().toISOString();
    const result = db.prepare(
      `INSERT INTO ticket_templates (name, description, icon, type, product, priority, body, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(name.trim(), description, icon, type, product, priority, body, position, now, now);
    const created = db.prepare(`SELECT * FROM ticket_templates WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (e) { return handleError(res, e); }
});

// PUT /api/ticket-templates/:id — admin only
router.put('/:id', adminOnly, (req, res) => {
  try {
    const { name, description, icon, type, product, priority, body, position } = req.body;
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE ticket_templates SET name=?, description=?, icon=?, type=?, product=?, priority=?, body=?, position=?, updated_at=? WHERE id=?`
    ).run(name, description ?? '', icon ?? '📋', type ?? '', product ?? '', priority ?? 'Medium', body ?? '', position ?? 0, now, req.params.id);
    const updated = db.prepare(`SELECT * FROM ticket_templates WHERE id = ?`).get(req.params.id);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (e) { return handleError(res, e); }
});

// DELETE /api/ticket-templates/:id — admin only
router.delete('/:id', adminOnly, (req, res) => {
  try {
    db.prepare(`DELETE FROM ticket_templates WHERE id = ?`).run(req.params.id);
    res.json({ success: true });
  } catch (e) { return handleError(res, e); }
});

module.exports = router;
