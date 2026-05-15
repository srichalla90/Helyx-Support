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

// List all groups with member count — any authenticated user
router.get('/', (req, res) => {
  try {
    const groups = db.prepare(`
      SELECT g.*, COUNT(gm.user_id) AS member_count
      FROM "groups" g
      LEFT JOIN group_members gm ON gm.group_id = g.id
      GROUP BY g.id
      ORDER BY g.name
    `).all();
    res.json(groups);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create group — admin only
router.post('/', adminOnly, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = db.prepare(`INSERT INTO "groups" (name) VALUES (?)`).run(name);
    const group  = db.prepare(`SELECT * FROM "groups" WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json(group);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Group already exists' });
    res.status(500).json({ error: e.message });
  }
});

// Edit group (rename) — admin only
router.put('/:id', adminOnly, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const info = db.prepare(`UPDATE "groups" SET name = ? WHERE id = ?`).run(name, Number(req.params.id));
    if (info.changes === 0) return res.status(404).json({ error: 'Group not found' });
    const group = db.prepare(`SELECT * FROM "groups" WHERE id = ?`).get(Number(req.params.id));
    res.json(group);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Group name already exists' });
    res.status(500).json({ error: e.message });
  }
});

// Toggle active status — admin only
router.patch('/:id/status', adminOnly, (req, res) => {
  const { active } = req.body;
  if (active === undefined) return res.status(400).json({ error: 'active is required' });
  const val = active ? 1 : 0;
  const info = db.prepare(`UPDATE "groups" SET active = ? WHERE id = ?`).run(val, Number(req.params.id));
  if (info.changes === 0) return res.status(404).json({ error: 'Group not found' });
  const group = db.prepare(`SELECT * FROM "groups" WHERE id = ?`).get(Number(req.params.id));
  res.json(group);
});

// Delete group — admin only
router.delete('/:id', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT id FROM "groups" WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'Group not found' });
  db.prepare('DELETE FROM group_members WHERE group_id = ?').run(id);
  db.prepare('UPDATE tickets SET group_id = NULL WHERE group_id = ?').run(id);
  db.prepare(`DELETE FROM "groups" WHERE id = ?`).run(id);
  res.json({ success: true });
});

// List members of a group — any authenticated user
router.get('/:id/members', (req, res) => {
  try {
    const members = db.prepare(`
      SELECT u.* FROM users u
      JOIN group_members gm ON gm.user_id = u.id
      WHERE gm.group_id = ?
      ORDER BY u.name
    `).all(Number(req.params.id));
    res.json(members);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Add member to group — admin only
router.post('/:id/members', adminOnly, (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });
  try {
    db.prepare(`INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)`).run(
      Number(req.params.id), Number(user_id)
    );
    res.status(201).json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Remove member from group — admin only
router.delete('/:id/members/:userId', adminOnly, (req, res) => {
  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(
    Number(req.params.id), Number(req.params.userId)
  );
  res.json({ success: true });
});

module.exports = router;
