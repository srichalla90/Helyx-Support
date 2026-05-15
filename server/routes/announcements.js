/**
 * announcements.js — Announcements routes
 *
 *  GET    /api/announcements          — all (agent/admin, includes drafts)
 *  GET    /api/announcements/public   — published only (customer portal)
 *  POST   /api/announcements          — create
 *  PUT    /api/announcements/:id      — update (fires email blast on draft→published)
 *  DELETE /api/announcements/:id      — delete
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const graph   = require('../services/graph');

function now() { return new Date().toISOString(); }

const VALID_TYPES = ['new_feature', 'coming_soon', 'maintenance', 'general', 'bug_fix'];

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

const TYPE_LABELS = {
  new_feature:  '🚀 New Feature',
  coming_soon:  '🔮 Coming Soon',
  maintenance:  '🔧 Maintenance',
  general:      '📣 Announcement',
  bug_fix:      '🐛 Bug Fix',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSetting(key) {
  try {
    const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
    return row ? row.value : null;
  } catch (_) { return null; }
}

// Render {{variable}} placeholders in a template string
function renderTemplate(template, vars) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v != null ? String(v) : '');
  }
  return out;
}

async function sendAnnouncementBlast(announcement) {
  try {
    const companyName     = getSetting('company_name') || 'Helyx';
    const portalUrl       = getSetting('portal_url')   || '';
    const notifyCustomers = getSetting('announce_notify_customers') === '1';
    const notifyAgents    = getSetting('announce_notify_agents')    === '1';

    const recipients = new Set();

    if (notifyCustomers) {
      // All unique requester emails from existing tickets
      const ticketEmails = db.prepare(
        `SELECT DISTINCT requester_email FROM tickets WHERE requester_email IS NOT NULL AND requester_email != ''`
      ).all();
      for (const r of ticketEmails) recipients.add(r.requester_email.toLowerCase());

      // Users with the customer role
      const customers = db.prepare(
        `SELECT email FROM users WHERE role = 'customer' AND active = 1 AND email IS NOT NULL AND email != ''`
      ).all();
      for (const c of customers) recipients.add(c.email.toLowerCase());
    }

    if (notifyAgents) {
      const agents = db.prepare(
        `SELECT email FROM users WHERE role IN ('agent','admin') AND active = 1 AND email IS NOT NULL AND email != ''`
      ).all();
      for (const a of agents) recipients.add(a.email.toLowerCase());
    }

    if (recipients.size === 0) {
      console.log('📣  Announcement published — no recipients configured for email blast.');
      return;
    }

    // Load the announcement_published template from DB
    const tmpl = db.prepare(`SELECT subject, body, enabled FROM email_templates WHERE key = 'announcement_published'`).get();
    if (!tmpl || tmpl.enabled === 0) {
      console.log('📣  Announcement email template is disabled — blast skipped.');
      return;
    }

    // Strip script/style tags from the announcement body before embedding in email
    const safeBody = announcement.body
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    const vars = {
      company_name: companyName,
      title:        announcement.title,
      type_label:   TYPE_LABELS[announcement.type] || '📣 Announcement',
      body:         safeBody || '<p style="color:#6B7280;">No additional details provided.</p>',
      portal_url:   portalUrl,
    };

    const subject  = renderTemplate(tmpl.subject, vars);
    const htmlBody = renderTemplate(tmpl.body,    vars);

    const to = Array.from(recipients);
    await graph.sendNotification({ to, subject, htmlBody });

    console.log(`📣  Announcement email blast sent to ${to.length} recipient(s).`);
  } catch (err) {
    console.error('⚠️  Announcement email blast failed:', err.message);
  }
}

// ── GET /api/announcements ────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM announcements ORDER BY pinned DESC, updated_at DESC').all();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/announcements/public ─────────────────────────────────────────────
router.get('/public', (_req, res) => {
  try {
    const rows = db.prepare(
      `SELECT * FROM announcements WHERE status = 'published' ORDER BY pinned DESC, published_at DESC`
    ).all();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/announcements ───────────────────────────────────────────────────
router.post('/', adminOnly, (req, res) => {
  let { title, body = '', type = 'general', status = 'draft', pinned = false, send_email = false } = req.body;
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

    // Only blast if caller explicitly opted in
    if (safeStatus === 'published' && send_email) sendAnnouncementBlast(row);

    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /api/announcements/:id ────────────────────────────────────────────────
router.put('/:id', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  let { title, body = '', type = 'general', status = 'draft', pinned = false, send_email = false } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  if (!VALID_TYPES.includes(type)) type = 'general';
  const safeStatus = status === 'published' ? 'published' : 'draft';
  const ts = now();

  try {
    const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const wasPublished = existing.status === 'published';
    const nowPublished = safeStatus === 'published';

    // Only set published_at the first time it transitions to published
    const publishedAt = nowPublished ? (existing.published_at || ts) : null;

    db.prepare(`
      UPDATE announcements
      SET title = ?, body = ?, type = ?, status = ?, pinned = ?, published_at = ?, updated_at = ?
      WHERE id = ?
    `).run(title.trim(), body, type, safeStatus, pinned ? 1 : 0, publishedAt, ts, id);

    const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);

    // Only blast when caller explicitly opted in (send_email flag) AND it's a publish action
    if (nowPublished && send_email) sendAnnouncementBlast(row);

    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/announcements/:id ─────────────────────────────────────────────
router.delete('/:id', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  try {
    const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
