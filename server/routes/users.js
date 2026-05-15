const express = require('express');
const router  = express.Router();
const db      = require('../db');

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can perform this action' });
  }
  next();
}

// Validate numeric :id params before any handler runs
router.param('id', (req, res, next, val) => {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'Invalid ID' });
  next();
});

// List all users — any authenticated user (agents need this for dropdowns)
router.get('/', (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY name').all();
  res.json(users);
});

// Create user — admin only
router.post('/', adminOnly, (req, res) => {
  const { name, email, role } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  const assignedRole = ['admin', 'agent', 'customer'].includes(role) ? role : 'agent';
  try {
    const result = db.prepare('INSERT INTO users (name, email, role, active) VALUES (?, ?, ?, 1)').run(name, email, assignedRole);
    const user   = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(user);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
    throw e;
  }
});

// Edit user (name, email, role) — admin only
router.put('/:id', adminOnly, (req, res) => {
  const { name, email, role } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  const assignedRole = ['admin', 'agent', 'customer'].includes(role) ? role : 'agent';
  try {
    const info = db.prepare(
      'UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?'
    ).run(name, email, assignedRole, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'User not found' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    res.json(user);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
    throw e;
  }
});

// Toggle active status — admin only
router.patch('/:id/status', adminOnly, (req, res) => {
  const { active } = req.body;
  if (active === undefined) return res.status(400).json({ error: 'active is required' });
  const val = active ? 1 : 0;
  const info = db.prepare('UPDATE users SET active = ? WHERE id = ?').run(val, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'User not found' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  res.json(user);
});

// Delete user — admin only
router.delete('/:id', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  db.prepare('DELETE FROM group_members WHERE user_id = ?').run(id);
  db.prepare('UPDATE tickets SET assigned_to = NULL WHERE assigned_to = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
