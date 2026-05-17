const express    = require('express');
const router     = express.Router();
const db         = require('../db');
const handleError = require('../middleware/handleError');
const staffOnly   = require('../middleware/staffOnly');

// GET / — list all defined tags
router.get('/', (req, res) => {
  try {
    const tags = db.prepare('SELECT * FROM tag_definitions ORDER BY name ASC').all();
    res.json(tags);
  } catch (e) { return handleError(res, e); }
});

// POST / — create a tag definition
router.post('/', staffOnly, (req, res) => {
  try {
    let { name, color, bg, description } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    name        = name.trim().toLowerCase();
    color       = (color       || '#1D4ED8').trim();
    bg          = (bg          || '#EFF6FF').trim();
    description = (description || '').trim();

    if (!name) return res.status(400).json({ error: 'name cannot be empty' });
    if (name.length > 30) return res.status(400).json({ error: 'name must be 30 characters or fewer' });

    db.prepare(
      'INSERT INTO tag_definitions (name, color, bg, description) VALUES (?, ?, ?, ?)'
    ).run(name, color, bg, description);

    const tags = db.prepare('SELECT * FROM tag_definitions ORDER BY name ASC').all();
    res.status(201).json(tags);
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'A tag with that name already exists' });
    }
    return handleError(res, e);
  }
});

// PATCH /:name — update color/bg/description
router.patch('/:name', staffOnly, (req, res) => {
  try {
    const { color, bg, description } = req.body;
    const name = req.params.name;

    const existing = db.prepare('SELECT * FROM tag_definitions WHERE name = ?').get(name);
    if (!existing) return res.status(404).json({ error: 'Tag not found' });

    db.prepare(
      'UPDATE tag_definitions SET color = ?, bg = ?, description = ? WHERE name = ?'
    ).run(
      color       !== undefined ? color       : existing.color,
      bg          !== undefined ? bg          : existing.bg,
      description !== undefined ? description : existing.description,
      name
    );

    const tags = db.prepare('SELECT * FROM tag_definitions ORDER BY name ASC').all();
    res.json(tags);
  } catch (e) { return handleError(res, e); }
});

// DELETE /:name — remove a tag definition
router.delete('/:name', staffOnly, (req, res) => {
  try {
    db.prepare('DELETE FROM tag_definitions WHERE name = ?').run(req.params.name);
    const tags = db.prepare('SELECT * FROM tag_definitions ORDER BY name ASC').all();
    res.json(tags);
  } catch (e) { return handleError(res, e); }
});

module.exports = router;
