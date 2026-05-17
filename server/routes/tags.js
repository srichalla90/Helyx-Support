const express = require('express');
const router  = express.Router({ mergeParams: true });
const db      = require('../db');
const handleError = require('../middleware/handleError');
const staffOnly   = require('../middleware/staffOnly');

function getTags(ticketId) {
  return db.prepare('SELECT tag FROM ticket_tags WHERE ticket_id = ? ORDER BY tag ASC')
    .all(ticketId)
    .map(r => r.tag);
}

// GET / — return all tags for a ticket
router.get('/', (req, res) => {
  try {
    const tags = getTags(req.params.ticketId);
    res.json(tags);
  } catch (e) { return handleError(res, e); }
});

// POST / — add a tag
router.post('/', staffOnly, (req, res) => {
  try {
    let { tag } = req.body;
    if (!tag || typeof tag !== 'string') {
      return res.status(400).json({ error: 'tag is required' });
    }
    tag = tag.trim().toLowerCase();
    if (!tag) {
      return res.status(400).json({ error: 'tag cannot be empty' });
    }
    if (tag.length > 30) {
      return res.status(400).json({ error: 'tag must be 30 characters or fewer' });
    }
    db.prepare('INSERT OR IGNORE INTO ticket_tags (ticket_id, tag) VALUES (?, ?)')
      .run(req.params.ticketId, tag);
    const tags = getTags(req.params.ticketId);
    res.json(tags);
  } catch (e) { return handleError(res, e); }
});

// DELETE /:tag — remove a tag
router.delete('/:tag', staffOnly, (req, res) => {
  try {
    db.prepare('DELETE FROM ticket_tags WHERE ticket_id = ? AND tag = ?')
      .run(req.params.ticketId, req.params.tag);
    const tags = getTags(req.params.ticketId);
    res.json(tags);
  } catch (e) { return handleError(res, e); }
});

module.exports = router;
