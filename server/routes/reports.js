/**
 * reports.js — Saved Reports routes
 *
 *  GET    /api/reports          — list all saved reports (agents + admins)
 *  POST   /api/reports          — save a new report
 *  DELETE /api/reports/:id      — delete a saved report
 */

const express     = require('express');
const router      = express.Router();
const db          = require('../db');
const handleError = require('../middleware/handleError');
const staffOnly   = require('../middleware/staffOnly');

function now() { return new Date().toISOString(); }

// Validate numeric :id params
router.param('id', (req, res, next, val) => {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'Invalid ID' });
  next();
});

// ── GET /api/reports — list all saved reports ─────────────────────────────────
router.get('/', staffOnly, (req, res) => {
  try {
    const reports = db.prepare(`
      SELECT id, name, filters, columns, created_by, created_at, updated_at
      FROM saved_reports
      ORDER BY updated_at DESC
    `).all();

    // Parse JSON fields
    const parsed = reports.map((r) => ({
      ...r,
      filters: JSON.parse(r.filters || '{}'),
      columns: JSON.parse(r.columns || '[]'),
    }));

    res.json(parsed);
  } catch (e) {
    handleError(res, e, '[GET /reports]');
  }
});

// ── POST /api/reports — save a new report ─────────────────────────────────────
router.post('/', staffOnly, (req, res) => {
  try {
    const { name, filters, columns } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Report name is required' });
    }

    const createdBy = req.user?.email || req.user?.name || 'unknown';
    const ts        = now();

    const { lastInsertRowid } = db.prepare(`
      INSERT INTO saved_reports (name, filters, columns, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      name.trim(),
      JSON.stringify(filters || {}),
      JSON.stringify(columns || []),
      createdBy,
      ts,
      ts,
    );

    const report = db.prepare(`SELECT * FROM saved_reports WHERE id = ?`).get(lastInsertRowid);
    res.status(201).json({
      ...report,
      filters: JSON.parse(report.filters || '{}'),
      columns: JSON.parse(report.columns || '[]'),
    });
  } catch (e) {
    handleError(res, e, '[POST /reports]');
  }
});

// ── PUT /api/reports/:id — update an existing report ─────────────────────────
router.put('/:id', (req, res) => {
  try {
    const { name, filters, columns } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Report name is required' });
    }

    const { changes } = db.prepare(`
      UPDATE saved_reports
      SET name = ?, filters = ?, columns = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name.trim(),
      JSON.stringify(filters || {}),
      JSON.stringify(columns || []),
      now(),
      Number(req.params.id),
    );

    if (!changes) return res.status(404).json({ error: 'Report not found' });

    const report = db.prepare(`SELECT * FROM saved_reports WHERE id = ?`).get(Number(req.params.id));
    res.json({
      ...report,
      filters: JSON.parse(report.filters || '{}'),
      columns: JSON.parse(report.columns || '[]'),
    });
  } catch (e) {
    handleError(res, e, '[PUT /reports/:id]');
  }
});

// ── DELETE /api/reports/:id ───────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const { changes } = db.prepare(`DELETE FROM saved_reports WHERE id = ?`).run(Number(req.params.id));
    if (!changes) return res.status(404).json({ error: 'Report not found' });
    res.json({ ok: true });
  } catch (e) {
    handleError(res, e, '[DELETE /reports/:id]');
  }
});

module.exports = router;
