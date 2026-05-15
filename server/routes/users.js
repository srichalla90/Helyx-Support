const express = require('express');
const router  = express.Router();
const db      = require('../db');

// List all users
router.get('/', (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY name').all();
  res.json(users);
});

// Create user
router.post('/', (req, res) => {
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

// Edit user (name, email, role)
router.put('/:id', (req, res) => {
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

// Toggle active status (deactivate / reactivate)
router.patch('/:id/status', (req, res) => {
  const { active } = req.body;
  if (active === undefined) return res.status(400).json({ error: 'active is required' });
  const val = active ? 1 : 0;
  const info = db.prepare('UPDATE users SET active = ? WHERE id = ?').run(val, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'User not found' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  res.json(user);
});

// Delete user
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ success: true });
});

module.exports = router;
