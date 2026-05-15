/**
 * announcements.js — Announcements routes
 *
 *  GET    /api/announcements          — all (agent/admin, includes drafts)
 *  GET    /api/announcements/public   — published only (customer portal)
 *  POST   /api/announcements          — create
 *  PUT    /api/announcements/:id      — update
 *  DELETE /api/announcements/:id      — delete
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');

function now() { return new Date().toISOString(); }

const VALID_TYPES = ['new_feature', 'coming_soon', 'maintenance', 'general', 'bug_fix'];

// ── GET /api/announcements ────────────────────────────────────────────────────
// All announcements (drafts + published) — for agent/admin view
router.get('/', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM announcements ORDER BY pinned DESC, updated_at DESC').all();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/announcements/public ─────────────────────────────────────────────
// Published announcements only — for customer portal
router.get('/public', (_req, res) => {
  try {
    const rows = db.prepare(
      `SELECT * FROM announcements WHERE status = 'published' ORDER BY pinned DESC, published_at DESC`
    ).all();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/announcements ───────────────────────────────────────────────────
router.post('/', (req, res) => {
  let { title, body = '', type = 'general', status = 'draft', pinned = false } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  if (!VALID_TYPES.includes(type)) type = 'general';
  const safeStatus = status === 'published' ? 'published' : 'draft';
  const ts = now();
  const publishedAt = safeStatus === 'published' ? ts : null;
  try {
    const result = db.prepare(`
      INSERT INTO announcements (title, body, type, status, pinned, published_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title.trim(), body, type, safeStatus, pinned ? 1 : 0, publishedAt, ts, ts);
    const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /api/announcements/:id ────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  let { title, body = '', type = 'general', status = 'draft', pinned = false } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  if (!VALID_TYPES.includes(type)) type = 'general';
  const safeStatus = status === 'published' ? 'published' : 'draft';
  const ts = now();

  try {
    const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    // Only set published_at the first time it transitions to published
    const publishedAt = safeStatus === 'published'
      ? (existing.published_at || ts)
      : null;

    db.prepare(`
      UPDATE announcements
      SET title = ?, body = ?, type = ?, status = ?, pinned = ?, published_at = ?, updated_at = ?
      WHERE id = ?
    `).run(title.trim(), body, type, safeStatus, pinned ? 1 : 0, publishedAt, ts, id);

    const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/announcements/:id ─────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  try {
    const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
