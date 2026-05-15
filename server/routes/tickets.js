const express = require('express');
const router  = express.Router();
const db      = require('../db');

function now() { return new Date().toISOString(); }

// ── List tickets ──────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { status, priority, product, group_id, type, customer_id, requester_email, search } = req.query;

  let sql = `
    SELECT t.*,
           c.name AS customer_name,
           g.name AS group_name
    FROM tickets t
    LEFT JOIN customers c ON c.id = t.customer_id
    LEFT JOIN "groups"  g ON g.id = t.group_id
    WHERE 1=1
  `;
  const params = [];

  if (status)      { sql += ` AND t.status = ?`;      params.push(status); }
  if (priority)    { sql += ` AND t.priority = ?`;    params.push(priority); }
  if (product)     { sql += ` AND t.product = ?`;     params.push(product); }
  if (group_id)    { sql += ` AND t.group_id = ?`;    params.push(Number(group_id)); }
  if (type)        { sql += ` AND t.type = ?`;        params.push(type); }
  if (customer_id)     { sql += ` AND t.customer_id = ?`;         params.push(Number(customer_id)); }
  if (requester_email) { sql += ` AND LOWER(t.requester_email) = LOWER(?)`; params.push(requester_email); }
  if (search) {
    sql += ` AND (t.title LIKE ? OR t.description LIKE ? OR t.requester_email LIKE ?)`;
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  sql += ' ORDER BY t.created_at DESC';

  try {
    const tickets = db.prepare(sql).all(...params);
    res.json(tickets);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get single ticket ─────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const ticket = db.prepare(`
    SELECT t.*, c.name AS customer_name, g.name AS group_name
    FROM tickets t
    LEFT JOIN customers c ON c.id = t.customer_id
    LEFT JOIN "groups"  g ON g.id = t.group_id
    WHERE t.id = ?
  `).get(Number(req.params.id));

  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const publicOnly = req.query.public_only === '1';
  const comments = db.prepare(
    `SELECT * FROM ticket_comments WHERE ticket_id = ?${publicOnly ? ' AND is_public = 1' : ''} ORDER BY created_at ASC`
  ).all(Number(req.params.id));

  res.json({ ...ticket, comments });
});

// ── Create ticket ─────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const {
    title, description, type, requester_email,
    product, status, priority, customer_id, group_id, source,
  } = req.body;

  if (!title) return res.status(400).json({ error: 'Title is required' });

  try {
    const result = db.prepare(`
      INSERT INTO tickets
        (title, description, type, requester_email, product, status, priority, customer_id, group_id, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title,
      description    || null,
      type           || 'Question / How-To',
      requester_email || null,
      product        || null,
      status         || 'Open',
      priority       || 'Medium',
      customer_id    || null,
      group_id       || null,
      source         || 'manual',
      now(), now(),
    );

    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(ticket);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Update ticket ─────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const id     = Number(req.params.id);
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const {
    title, description, type, requester_email,
    product, status, priority, customer_id, group_id,
    ado_bug_id, deviation_id,
  } = req.body;

  try {
    db.prepare(`
      UPDATE tickets SET
        title           = ?,
        description     = ?,
        type            = ?,
        requester_email = ?,
        product         = ?,
        status          = ?,
        priority        = ?,
        customer_id     = ?,
        group_id        = ?,
        ado_bug_id      = ?,
        deviation_id    = ?,
        updated_at      = ?
      WHERE id = ?
    `).run(
      title           ?? ticket.title,
      description     ?? ticket.description,
      type            ?? ticket.type,
      requester_email ?? ticket.requester_email,
      product         ?? ticket.product,
      status          ?? ticket.status,
      priority        ?? ticket.priority,
      customer_id     !== undefined ? (customer_id || null) : ticket.customer_id,
      group_id        !== undefined ? (group_id    || null) : ticket.group_id,
      ado_bug_id      !== undefined ? (ado_bug_id  || null) : ticket.ado_bug_id,
      deviation_id    !== undefined ? (deviation_id || null) : ticket.deviation_id,
      now(), id,
    );

    const updated = db.prepare(`
      SELECT t.*, c.name AS customer_name, g.name AS group_name
      FROM tickets t
      LEFT JOIN customers c ON c.id = t.customer_id
      LEFT JOIN "groups"  g ON g.id = t.group_id
      WHERE t.id = ?
    `).get(id);

    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Delete ticket ─────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM tickets WHERE id = ?').run(Number(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: 'Ticket not found' });
  res.json({ success: true });
});

// ── Add comment ───────────────────────────────────────────────────────────────
router.post('/:id/comments', async (req, res) => {
  const { author, author_role, body, is_public } = req.body;
  if (!body) return res.status(400).json({ error: 'Comment body is required' });

  // Default to public (1) unless explicitly set to false/0
  const isPublic = (is_public === false || is_public === 0) ? 0 : 1;

  const ticketId = Number(req.params.id);

  const result = db.prepare(
    `INSERT INTO ticket_comments (ticket_id, author, author_role, body, is_public) VALUES (?, ?, ?, ?, ?)`
  ).run(ticketId, author || 'Agent', author_role || 'agent', body, isPublic);

  db.prepare('UPDATE tickets SET updated_at = ? WHERE id = ?').run(now(), ticketId);

  const comment = db.prepare('SELECT * FROM ticket_comments WHERE id = ?').get(result.lastInsertRowid);

  // ── Send email reply for public comments on email-sourced tickets ──────────
  if (isPublic) {
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
    if (ticket?.requester_email && ticket?.source === 'email') {
      // Fire-and-forget — don't let email failure block the API response
      (async () => {
        try {
          const graph = require('../services/graph');
          await graph.sendReply({
            to:         ticket.requester_email,
            subject:    ticket.title,
            textBody:   body,
            htmlBody:
              `<p>${body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>` +
              `<hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb">` +
              `<p style="font-size:12px;color:#6b7280">` +
              `  Ticket #${ticket.id} · Helyx Support` +
              `</p>`,
            inReplyTo:  ticket.email_message_id,
            references: ticket.email_message_id,
          });
          console.log(`📤  Reply sent to ${ticket.requester_email} for ticket #${ticket.id}`);
        } catch (e) {
          console.warn(`⚠️  Email reply failed: ${e.message}`);
        }
      })();
    }
  }

  res.status(201).json(comment);
});

module.exports = router;
