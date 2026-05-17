/**
 * settings.js — App settings routes
 *
 *  GET  /api/settings      — return all settings as { key: value } map
 *  PUT  /api/settings      — bulk-upsert { key: value, ... } pairs
 *
 * Settings are stored in the `settings` table (key TEXT PK, value TEXT).
 * Seeded with defaults in db.js on first run.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const adminOnly    = require('../middleware/adminOnly');
const staffOnly    = require('../middleware/staffOnly');
const handleError   = require('../middleware/handleError');

// Keys that are allowed to be read/written via the API
const ALLOWED_KEYS = new Set([
  'company_name',
  'support_email',
  'portal_url',
  'announce_notify_customers',
  'announce_notify_agents',
  'products',
]);

// ── GET /api/settings ─────────────────────────────────────────────────────────
router.get('/', staffOnly, (_req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const map  = {};
    for (const r of rows) {
      if (ALLOWED_KEYS.has(r.key)) map[r.key] = r.value;
    }
    res.json(map);
  } catch (e) { return handleError(res, e); }
});

// ── PUT /api/settings ─────────────────────────────────────────────────────────
router.put('/', adminOnly, (req, res) => {
  const updates = req.body;
  if (typeof updates !== 'object' || Array.isArray(updates)) {
    return res.status(400).json({ error: 'Body must be a JSON object of key:value pairs' });
  }
  try {
    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_KEYS.has(key)) continue; // silently ignore unknown keys
      db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .run(key, String(value));
    }
    // Return full updated map
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const map  = {};
    for (const r of rows) {
      if (ALLOWED_KEYS.has(r.key)) map[r.key] = r.value;
    }
    res.json(map);
  } catch (e) { return handleError(res, e); }
});

module.exports = router;
