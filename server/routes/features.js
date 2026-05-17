/**
 * features.js — Feature Requests / Ideas Board
 *
 * Public (customers + agents):
 *   GET    /api/features                     — list (submitter hidden from customer queries)
 *   GET    /api/features/:id                 — single + comments (submitter hidden for customer)
 *   POST   /api/features                     — submit idea { title, description, submitter_email, submitter_name }
 *   POST   /api/features/:id/vote            — toggle upvote { voter_email }
 *   POST   /api/features/:id/comments        — add comment { author, author_email, body, is_official }
 *
 * Agent-only:
 *   GET    /api/features/:id/voters          — list who voted
 *   PUT    /api/features/:id/status          — update status { status }
 *   DELETE /api/features/:id                 — delete
 *   DELETE /api/features/:id/comments/:cid  — delete comment
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const handleError   = require('../middleware/handleError');
const staffOnly     = require('../middleware/staffOnly');

function now() { return new Date().toISOString(); }

const VALID_STATUSES = ['submitted', 'under_review', 'planned', 'in_progress', 'shipped', 'declined'];

// Validate numeric :id params before any handler runs
router.param('id', (req, res, next, val) => {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'Invalid ID' });
  next();
});

// ── GET /api/features ─────────────────────────────────────────────────────────
// Submitter PII is hidden from customers — derived from JWT role, not query param
router.get('/', (req, res) => {
  const isStaff = ['agent', 'admin'].includes(req.user?.role);
  try {
    const rows = db.prepare(
      `SELECT * FROM feature_requests ORDER BY vote_count DESC, created_at DESC`
    ).all();

    const result = rows.map((r) => ({
      ...r,
      submitter_email: isStaff ? r.submitter_email : null,
      submitter_name:  isStaff ? r.submitter_name  : 'Community Member',
    }));
    res.json(result);
  } catch (e) { return handleError(res, e); }
});

// ── GET /api/features/:id ─────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const isStaff = ['agent', 'admin'].includes(req.user?.role);
  try {
    const row = db.prepare('SELECT * FROM feature_requests WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    const comments = db.prepare(
      'SELECT * FROM feature_comments WHERE feature_id = ? ORDER BY created_at ASC'
    ).all(id);

    // Mask non-official author PII for customer view — derived from JWT role
    const maskedComments = comments.map((c) => ({
      ...c,
      author:       (!isStaff && !c.is_official) ? 'Community Member' : c.author,
      author_email: isStaff ? c.author_email : null,
    }));

    res.json({
      ...row,
      submitter_email: isStaff ? row.submitter_email : null,
      submitter_name:  isStaff ? row.submitter_name  : 'Community Member',
      comments: maskedComments,
    });
  } catch (e) { return handleError(res, e); }
});

// ── POST /api/features ────────────────────────────────────────────────────────
// submitter identity is always taken from the verified JWT — never from the request body
router.post('/', (req, res) => {
  const { title, description = '', product = '' } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  const submitter_email = req.user.email;
  const submitter_name  = req.user.name || req.user.email;
  const ts = now();
  try {
    const result = db.prepare(`
      INSERT INTO feature_requests (title, description, product, status, submitter_email, submitter_name, vote_count, created_at, updated_at)
      VALUES (?, ?, ?, 'submitted', ?, ?, 0, ?, ?)
    `).run(title.trim(), description, product.trim(), submitter_email, submitter_name, ts, ts);
    const row = db.prepare('SELECT * FROM feature_requests WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ ...row, comments: [], voted: false });
  } catch (e) { return handleError(res, e); }
});

// ── POST /api/features/:id/vote ───────────────────────────────────────────────
// Toggle: vote if not voted, unvote if already voted
// voter_email is always taken from the verified JWT — never from the request body
router.post('/:id/vote', (req, res) => {
  const id = Number(req.params.id);
  const voter_email = req.user.email; // always from JWT
  try {
    const existing = db.prepare(
      'SELECT id FROM feature_votes WHERE feature_id = ? AND voter_email = ?'
    ).get(id, voter_email);

    if (existing) {
      // Remove vote
      db.prepare('DELETE FROM feature_votes WHERE feature_id = ? AND voter_email = ?').run(id, voter_email);
      db.prepare('UPDATE feature_requests SET vote_count = MAX(0, vote_count - 1), updated_at = ? WHERE id = ?').run(now(), id);
      return res.json({ voted: false, vote_count: db.prepare('SELECT vote_count FROM feature_requests WHERE id = ?').get(id)?.vote_count ?? 0 });
    } else {
      // Add vote
      db.prepare('INSERT INTO feature_votes (feature_id, voter_email, created_at) VALUES (?, ?, ?)').run(id, voter_email, now());
      db.prepare('UPDATE feature_requests SET vote_count = vote_count + 1, updated_at = ? WHERE id = ?').run(now(), id);
      return res.json({ voted: true, vote_count: db.prepare('SELECT vote_count FROM feature_requests WHERE id = ?').get(id)?.vote_count ?? 0 });
    }
  } catch (e) { return handleError(res, e); }
});

// ── GET /api/features/:id/voters ─────────────────────────────────────────────
// Agent only
router.get('/:id/voters', staffOnly, (req, res) => {
  const id = Number(req.params.id);
  try {
    const voters = db.prepare('SELECT voter_email, created_at FROM feature_votes WHERE feature_id = ? ORDER BY created_at ASC').all(id);
    res.json(voters);
  } catch (e) { return handleError(res, e); }
});

// ── PUT /api/features/:id/status ──────────────────────────────────────────────
router.put('/:id/status', staffOnly, (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    db.prepare('UPDATE feature_requests SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);
    const row = db.prepare('SELECT * FROM feature_requests WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) { return handleError(res, e); }
});

// ── POST /api/features/:id/comments ──────────────────────────────────────────
// author identity is always taken from the verified JWT — never from the request body
router.post('/:id/comments', (req, res) => {
  const id = Number(req.params.id);
  const { body, is_official = false } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'body is required' });
  // Identity from JWT
  const author       = req.user.name  || req.user.email;
  const author_email = req.user.email;
  // Only agents/admins may mark a comment as official
  const isStaff = ['agent', 'admin'].includes(req.user?.role);
  const safeIsOfficial = isStaff ? (is_official ? 1 : 0) : 0;
  try {
    const result = db.prepare(`
      INSERT INTO feature_comments (feature_id, author, author_email, body, is_official, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, author, author_email, body.trim(), safeIsOfficial, now());
    db.prepare('UPDATE feature_requests SET updated_at = ? WHERE id = ?').run(now(), id);
    const comment = db.prepare('SELECT * FROM feature_comments WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(comment);
  } catch (e) { return handleError(res, e); }
});

// ── DELETE /api/features/:id/comments/:cid ───────────────────────────────────
router.delete('/:id/comments/:cid', staffOnly, (req, res) => {
  const cid = Number(req.params.cid);
  try {
    db.prepare('DELETE FROM feature_comments WHERE id = ?').run(cid);
    res.json({ success: true });
  } catch (e) { return handleError(res, e); }
});

// ── DELETE /api/features/:id ──────────────────────────────────────────────────
router.delete('/:id', staffOnly, (req, res) => {
  const id = Number(req.params.id);
  try {
    db.prepare('DELETE FROM feature_comments WHERE feature_id = ?').run(id);
    db.prepare('DELETE FROM feature_votes    WHERE feature_id = ?').run(id);
    db.prepare('DELETE FROM feature_requests WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (e) { return handleError(res, e); }
});

module.exports = router;
