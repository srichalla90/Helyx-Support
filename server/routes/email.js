/**
 * Email Ingest Endpoint
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/email/ingest
 *
 * Accepts a JSON payload from an email forwarding service and auto-creates
 * a support ticket. Wire this up with:
 *
 *   • SendGrid Inbound Parse  →  set webhook URL to http://yourserver/api/email/ingest
 *   • Postmark Inbound        →  same
 *   • Zapier (Gmail trigger)  →  POST action with JSON body
 *
 * Expected JSON body:
 * {
 *   "from":    "customer@example.com",
 *   "subject": "Login page is broken",
 *   "text":    "Hi, I can't log in since yesterday...",
 *   "html":    "<p>Hi, I can't log in...</p>"
 * }
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const handleError   = require('../middleware/handleError');

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

router.post('/ingest', (req, res) => {
  // Shared-secret validation — set INGEST_SECRET in .env to enable
  const secret = process.env.INGEST_SECRET;
  if (secret) {
    const provided = req.headers['x-ingest-secret'];
    if (!provided || provided !== secret) {
      return res.status(401).json({ error: 'Invalid or missing X-Ingest-Secret header' });
    }
  }

  const { from, subject, text, html } = req.body;

  const title       = (subject || 'No Subject').trim();
  const description = (text || (html ? stripHtml(html) : '') || '').trim() || null;
  const requester   = (from || '').trim() || null;

  if (!title && !description) {
    return res.status(400).json({ error: 'Email has no subject or body' });
  }

  try {
    const ts = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO tickets
        (title, description, requester_email, source, status, priority, type, created_at, updated_at)
      VALUES (?, ?, ?, 'email', 'Open', 'Medium', 'Question / How-To', ?, ?)
    `).run(title, description, requester, ts, ts);

    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(ticket);
  } catch (e) { return handleError(res, e); }
});

module.exports = router;
