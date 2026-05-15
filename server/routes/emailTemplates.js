/**
 * emailTemplates.js — Email template CRUD
 *
 *  GET  /api/email-templates         — all templates
 *  GET  /api/email-templates/:key    — single template
 *  PUT  /api/email-templates/:key    — update subject/body/enabled
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db');

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Only admins can perform this action' });
  next();
}

const ALLOWED_KEYS = new Set([
  'ticket_created_customer',
  'ticket_assigned_agent',
  'ticket_resolved_customer',
  'ticket_closed_customer',
  'announcement_published',
  'new_ticket_agent',
  'csat_survey',
  'agent_mentioned',
]);

router.get('/', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM email_templates').all();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:key', (req, res) => {
  const { key } = req.params;
  if (!ALLOWED_KEYS.has(key)) return res.status(404).json({ error: 'Template not found' });
  try {
    const row = db.prepare('SELECT * FROM email_templates WHERE key = ?').get(key);
    if (!row) return res.status(404).json({ error: 'Template not found' });
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:key', adminOnly, (req, res) => {
  const { key } = req.params;
  if (!ALLOWED_KEYS.has(key)) return res.status(404).json({ error: 'Template not found' });
  const { subject, body, enabled } = req.body;
  try {
    db.prepare(`
      INSERT INTO email_templates (key, subject, body, enabled) VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        subject = excluded.subject,
        body    = excluded.body,
        enabled = excluded.enabled
    `).run(key, subject || '', body || '', enabled !== false ? 1 : 0);
    const row = db.prepare('SELECT * FROM email_templates WHERE key = ?').get(key);
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
