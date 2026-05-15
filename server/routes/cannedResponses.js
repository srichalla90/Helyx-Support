const express = require('express');
const router = express.Router();
const db = require('../db');

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Only admins can perform this action' });
  next();
}

// Validate numeric :id params before any handler runs
router.param('id', (req, res, next, val) => {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'Invalid ID' });
  next();
});

// GET / — return all canned responses ordered by category then title
router.get('/', (req, res) => {
  try {
    const responses = db.prepare('SELECT * FROM canned_responses ORDER BY category, title').all();
    res.json(responses);
  } catch (err) {
    console.error('Error fetching canned responses:', err);
    res.status(500).json({ error: 'Failed to fetch canned responses' });
  }
});

// GET /:id — single canned response
router.get('/:id', (req, res) => {
  try {
    const response = db.prepare('SELECT * FROM canned_responses WHERE id = ?').get(req.params.id);
    if (!response) return res.status(404).json({ error: 'Canned response not found' });
    res.json(response);
  } catch (err) {
    console.error('Error fetching canned response:', err);
    res.status(500).json({ error: 'Failed to fetch canned response' });
  }
});

// POST / — create a new canned response (admin only)
router.post('/', adminOnly, (req, res) => {
  try {
    const { title, body, category } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const now = new Date().toISOString();
    const result = db.prepare(
      'INSERT INTO canned_responses (title, body, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(title.trim(), body || '', category || 'General', now, now);

    const created = db.prepare('SELECT * FROM canned_responses WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('Error creating canned response:', err);
    res.status(500).json({ error: 'Failed to create canned response' });
  }
});

// PUT /:id — update a canned response (admin only)
router.put('/:id', adminOnly, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM canned_responses WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Canned response not found' });

    const title = req.body.title !== undefined ? req.body.title : existing.title;
    const body = req.body.body !== undefined ? req.body.body : existing.body;
    const category = req.body.category !== undefined ? req.body.category : existing.category;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const now = new Date().toISOString();
    db.prepare(
      'UPDATE canned_responses SET title = ?, body = ?, category = ?, updated_at = ? WHERE id = ?'
    ).run(title.trim(), body || '', category || 'General', now, req.params.id);

    const updated = db.prepare('SELECT * FROM canned_responses WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error updating canned response:', err);
    res.status(500).json({ error: 'Failed to update canned response' });
  }
});

// DELETE /:id — delete a canned response (admin only)
router.delete('/:id', adminOnly, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM canned_responses WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Canned response not found' });

    db.prepare('DELETE FROM canned_responses WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting canned response:', err);
    res.status(500).json({ error: 'Failed to delete canned response' });
  }
});

module.exports = router;
