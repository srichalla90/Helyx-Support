const express = require('express');
const router  = express.Router();
const db      = require('../db');

// List all groups with member count
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

// Create group
router.post('/', (req, res) => {
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

// Edit group (rename)
router.put('/:id', (req, res) => {
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

// Toggle active status (deactivate / reactivate)
router.patch('/:id/status', (req, res) => {
  const { active } = req.body;
  if (active === undefined) return res.status(400).json({ error: 'active is required' });
  const val = active ? 1 : 0;
  const info = db.prepare(`UPDATE "groups" SET active = ? WHERE id = ?`).run(val, Number(req.params.id));
  if (info.changes === 0) return res.status(404).json({ error: 'Group not found' });
  const group = db.prepare(`SELECT * FROM "groups" WHERE id = ?`).get(Number(req.params.id));
  res.json(group);
});

// Delete group
router.delete('/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM "groups" WHERE id = ?`).run(Number(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: 'Group not found' });
  res.json({ success: true });
});

// List members of a group
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

// Add member to group
router.post('/:id/members', (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });
  try {
    db.prepare(`INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)`).run(
      Number(req.params.id), Number(user_id)
    );
    res.status(201).json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Remove member from group
router.delete('/:id/members/:userId', (req, res) => {
  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(
    Number(req.params.id), Number(req.params.userId)
  );
  res.json({ success: true });
});

module.exports = router;
