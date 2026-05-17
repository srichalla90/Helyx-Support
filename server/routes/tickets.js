const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const notify   = require('../services/emailNotifications');
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');
const tagsRouter = require('./tags');
const { applyAutomationRules } = require('./automation');
const handleError   = require('../middleware/handleError');

// Mount tags sub-router
router.use('/:ticketId/tags', tagsRouter);

// Validate numeric :id params before any handler runs
router.param('id', (req, res, next, val) => {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'Invalid ID' });
  next();
});

function now() { return new Date().toISOString(); }

const ATTACH_DIR = path.join(__dirname, '..', 'uploads', 'ticket_attachments');
fs.mkdirSync(ATTACH_DIR, { recursive: true });

const attachStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ATTACH_DIR),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`);
  },
});
const uploadAttach = multer({
  storage: attachStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg','image/png','image/gif','image/webp',
      'application/pdf',
      'text/plain','text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip','application/x-zip-compressed'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  }
});

// ── Activity helper ───────────────────────────────────────────────────────────
function logActivity(ticketId, actor, action, field, oldValue, newValue) {
  try {
    db.prepare(
      `INSERT INTO ticket_activity (ticket_id, actor, action, field, old_value, new_value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(ticketId, actor || 'System', action, field || null, oldValue != null ? String(oldValue) : null, newValue != null ? String(newValue) : null, now());
  } catch (e) {
    console.warn('Activity log failed:', e.message);
  }
}

// ── Ticket query helper ───────────────────────────────────────────────────────
const TICKET_SELECT = `
  SELECT t.*,
         c.name  AS customer_name,
         g.name  AS group_name,
         u.name  AS assigned_user_name,
         u.email AS assigned_user_email,
         sp.name             AS sla_policy_name,
         sp.resolution_hours AS sla_resolution_hours,
         CASE
           WHEN t.status IN ('Resolved','Closed','Canceled') THEN 'met'
           WHEN sp.id IS NULL                                 THEN NULL
           WHEN datetime('now') > datetime(t.created_at, '+' || sp.resolution_hours || ' hours') THEN 'breached'
           ELSE 'ok'
         END AS sla_status,
         CAST(
           (julianday(datetime(t.created_at, '+' || sp.resolution_hours || ' hours'))
            - julianday('now')) * 24
         AS REAL) AS sla_remaining_hours
  FROM tickets t
  LEFT JOIN customers c ON c.id = t.customer_id
  LEFT JOIN "groups"  g ON g.id = t.group_id
  LEFT JOIN users     u ON u.id = t.assigned_to
  LEFT JOIN sla_policies sp ON sp.priority = t.priority AND sp.active = 1
`;

// ── GET /api/tickets ──────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { status, priority, product, group_id, type, customer_id, search, assigned_to } = req.query;
  let requester_email = req.query.requester_email;
  let sql = TICKET_SELECT + ' WHERE 1=1';
  const params = [];

  // Customers may only see their own tickets — ignore any requester_email from the query param
  // and force-filter by the email in their verified JWT instead.
  if (req.user?.role === 'customer') {
    sql += ` AND LOWER(t.requester_email) = LOWER(?)`;
    params.push(req.user.email);
  } else {
    if (status)           { sql += ` AND t.status = ?`;                              params.push(status); }
    if (priority)         { sql += ` AND t.priority = ?`;                            params.push(priority); }
    if (product)          { sql += ` AND t.product = ?`;                             params.push(product); }
    if (group_id)         { sql += ` AND t.group_id = ?`;                            params.push(Number(group_id)); }
    if (type)             { sql += ` AND t.type = ?`;                                params.push(type); }
    if (customer_id)      { sql += ` AND t.customer_id = ?`;                         params.push(Number(customer_id)); }
    if (assigned_to)      { sql += ` AND t.assigned_to = ?`;                         params.push(Number(assigned_to)); }
    if (requester_email)  { sql += ` AND LOWER(t.requester_email) = LOWER(?)`;       params.push(requester_email); }
    if (search) {
      sql += ` AND (t.title LIKE ? OR t.description LIKE ? OR t.requester_email LIKE ?)`;
      const like = `%${search}%`;
      params.push(like, like, like);
    }
  }

  // Customers get search within their own tickets only
  if (req.user?.role === 'customer' && search) {
    sql += ` AND (t.title LIKE ? OR t.description LIKE ?)`;
    const like = `%${search}%`;
    params.push(like, like);
  }

  sql += ' ORDER BY t.created_at DESC';

  try {
    res.json(db.prepare(sql).all(...params));
  } catch (e) { return handleError(res, e); }
});

// ── GET /api/tickets/attachments/:id/download ────────────────────────────────
router.get('/attachments/:id/download', (req, res) => {
  const id = Number(req.params.id);
  try {
    const att = db.prepare('SELECT * FROM ticket_attachments WHERE id = ?').get(id);
    if (!att) return res.status(404).json({ error: 'Attachment not found' });
    // Prevent path traversal
    const resolved = path.resolve(ATTACH_DIR, att.filename);
    if (!resolved.startsWith(path.resolve(ATTACH_DIR) + path.sep)) {
      return res.status(400).json({ error: 'Invalid attachment' });
    }
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'File missing on disk' });
    // Customer ownership check (MED-6)
    if (req.user?.role === 'customer') {
      const ticket = db.prepare('SELECT requester_email, customer_id FROM tickets WHERE id = ?').get(att.ticket_id);
      if (!ticket || (ticket.requester_email !== req.user.email && ticket.customer_id !== req.user.id)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    res.download(resolved, att.original_name || att.display_name);
  } catch (e) { return handleError(res, e); }
});

// ── DELETE /api/tickets/attachments/:id ──────────────────────────────────────
// Only the uploader or staff (agent/admin) may delete an attachment
router.delete('/attachments/:id', (req, res) => {
  const id = Number(req.params.id);
  try {
    const att = db.prepare('SELECT * FROM ticket_attachments WHERE id = ?').get(id);
    if (!att) return res.status(404).json({ error: 'Attachment not found' });
    const isStaff = req.user?.role === 'admin' || req.user?.role === 'agent';
    const isUploader = att.uploaded_by && att.uploaded_by === req.user?.email;
    if (!isStaff && !isUploader) {
      return res.status(403).json({ error: 'Not authorised to delete this attachment' });
    }
    try { fs.unlinkSync(path.join(ATTACH_DIR, att.filename)); } catch (_) {}
    db.prepare('DELETE FROM ticket_attachments WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (e) { return handleError(res, e); }
});

// ── GET /api/tickets/:id ──────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const ticket = db.prepare(TICKET_SELECT + ' WHERE t.id = ?').get(id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  if (req.user?.role === 'customer') {
    if (ticket.requester_email !== req.user.email && ticket.customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  const isCustomer = req.user?.role === 'customer';
  const publicOnly = isCustomer || req.query.public_only === '1';
  const comments = db.prepare(
    `SELECT * FROM ticket_comments WHERE ticket_id = ?${publicOnly ? ' AND is_public = 1' : ''} ORDER BY created_at ASC`
  ).all(id);

  const attachments = db.prepare(
    'SELECT * FROM ticket_attachments WHERE ticket_id = ? ORDER BY created_at ASC'
  ).all(id);

  res.json({ ...ticket, comments, attachments });
});

// ── GET /api/tickets/:id/activity ─────────────────────────────────────────────
router.get('/:id/activity', (req, res) => {
  const id = Number(req.params.id);
  // Customers cannot view internal ticket activity
  if (req.user?.role === 'customer') {
    const t = db.prepare('SELECT requester_email FROM tickets WHERE id = ?').get(id);
    if (!t || t.requester_email !== req.user.email) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  try {
    const rows = db.prepare(
      'SELECT * FROM ticket_activity WHERE ticket_id = ? ORDER BY created_at ASC'
    ).all(id);
    res.json(rows);
  } catch (e) { return handleError(res, e); }
});

// ── POST /api/tickets ─────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const {
    title, description, type, requester_email,
    product, status, priority, customer_id, group_id, source, assigned_to,
  } = req.body;
  const actor = req.user?.name || req.user?.email || 'System';
  if (!title) return res.status(400).json({ error: 'Title is required' });

  try {
    const result = db.prepare(`
      INSERT INTO tickets
        (title, description, type, requester_email, product, status, priority, customer_id, group_id, source, assigned_to, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title,
      description     || null,
      type            || 'Question / How-To',
      requester_email || null,
      product         || null,
      status          || 'Open',
      priority        || 'Medium',
      customer_id     || null,
      group_id        || null,
      source          || 'manual',
      assigned_to     || null,
      now(), now(),
    );

    const ticket = db.prepare(TICKET_SELECT + ' WHERE t.id = ?').get(result.lastInsertRowid);

    // Activity log
    const actorName = actor;
    logActivity(ticket.id, actorName, 'created', null, null, ticket.status);
    if (ticket.assigned_to && ticket.assigned_user_name) {
      logActivity(ticket.id, actorName, 'assigned', 'assigned_to', null, ticket.assigned_user_name);
    }

    // Email notification (fire-and-forget)
    notify.notifyTicketCreated(ticket).catch(() => {});

    // If assigned on creation, notify assigned agent
    if (ticket.assigned_to && ticket.assigned_user_email) {
      notify.notifyTicketAssigned(ticket, ticket.assigned_user_name, ticket.assigned_user_email).catch(() => {});
    }

    // Apply automation rules (fire-and-forget, don't block response)
    try { applyAutomationRules(ticket, 'ticket_created'); } catch (_) {}

    res.status(201).json({ ...ticket, comments: [], attachments: [] });
  } catch (e) { return handleError(res, e); }
});

// ── PUT /api/tickets/:id ──────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const id     = Number(req.params.id);

  if (req.user?.role === 'customer') {
    // Customers can only update their own tickets
    const existing = db.prepare('SELECT requester_email, customer_id FROM tickets WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });
    if (existing.requester_email !== req.user.email && existing.customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  const ticket = db.prepare(TICKET_SELECT + ' WHERE t.id = ?').get(id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const {
    title, description, type, requester_email,
    product, status, priority, customer_id, group_id,
    ado_bug_id, deviation_id, assigned_to,
  } = req.body;
  const actor = req.user?.name || req.user?.email || 'System';

  // Compute which fields are actually changing for activity log
  const actorName    = actor || 'Agent';
  const newStatus    = status      ?? ticket.status;
  const newPriority  = priority    ?? ticket.priority;
  const newType      = type        ?? ticket.type;
  const newProduct   = product     !== undefined ? (product || null) : ticket.product;
  const newGroupId   = group_id    !== undefined ? (group_id || null) : ticket.group_id;
  const newCustId    = customer_id !== undefined ? (customer_id || null) : ticket.customer_id;
  const newAssigned  = assigned_to !== undefined ? (assigned_to || null) : ticket.assigned_to;
  const newAdoBugId  = ado_bug_id  !== undefined ? (ado_bug_id || null) : ticket.ado_bug_id;
  const newDevId     = deviation_id !== undefined ? (deviation_id || null) : ticket.deviation_id;
  const newTitle     = title ?? ticket.title;
  const newDesc      = description ?? ticket.description;
  const newReqEmail  = requester_email ?? ticket.requester_email;

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
        assigned_to     = ?,
        updated_at      = ?
      WHERE id = ?
    `).run(
      newTitle, newDesc, newType, newReqEmail, newProduct,
      newStatus, newPriority, newCustId, newGroupId,
      newAdoBugId, newDevId, newAssigned,
      now(), id,
    );

    // Activity log — only log changed fields
    if (newStatus   !== ticket.status)   logActivity(id, actorName, 'status_changed',   'status',   ticket.status,   newStatus);
    if (newPriority !== ticket.priority) logActivity(id, actorName, 'priority_changed', 'priority', ticket.priority, newPriority);
    if (newType     !== ticket.type)     logActivity(id, actorName, 'type_changed',     'type',     ticket.type,     newType);
    if (newProduct  !== ticket.product)  logActivity(id, actorName, 'product_changed',  'product',  ticket.product,  newProduct);
    if (String(newAssigned || '') !== String(ticket.assigned_to || '')) {
      if (newAssigned) {
        const assignedUser = db.prepare('SELECT name FROM users WHERE id = ?').get(newAssigned);
        logActivity(id, actorName, 'assigned', 'assigned_to', ticket.assigned_user_name || null, assignedUser?.name || String(newAssigned));
      } else {
        logActivity(id, actorName, 'unassigned', 'assigned_to', ticket.assigned_user_name || null, null);
      }
    }

    const updated = db.prepare(TICKET_SELECT + ' WHERE t.id = ?').get(id);

    // Email notifications (fire-and-forget)
    if (newStatus !== ticket.status) {
      if (newStatus === 'Resolved') notify.notifyTicketResolved(updated).catch(() => {});
      if (newStatus === 'Closed')   notify.notifyTicketClosed(updated).catch(() => {});
    }
    if (String(newAssigned || '') !== String(ticket.assigned_to || '') && newAssigned && updated.assigned_user_email) {
      notify.notifyTicketAssigned(updated, updated.assigned_user_name, updated.assigned_user_email).catch(() => {});
    }

    // Apply automation rules (fire-and-forget)
    try { applyAutomationRules(updated, 'ticket_updated'); } catch (_) {}

    res.json(updated);
  } catch (e) { return handleError(res, e); }
});

// ── DELETE /api/tickets/:id ── admin only ─────────────────────────────────────
router.delete('/:id', (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can delete tickets' });
  }
  const id = Number(req.params.id);
  try {
    const existing = db.prepare('SELECT id FROM tickets WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });

    // Delete physical attachment files from disk before removing DB rows
    const attachments = db.prepare('SELECT filename FROM ticket_attachments WHERE ticket_id = ?').all(id);
    for (const att of attachments) {
      try { fs.unlinkSync(path.join(ATTACH_DIR, att.filename)); } catch (_) {}
    }

    // Remove all child records then the ticket itself
    db.prepare('DELETE FROM ticket_tags          WHERE ticket_id = ?').run(id);
    db.prepare('DELETE FROM csat_ratings         WHERE ticket_id = ?').run(id);
    db.prepare('DELETE FROM ticket_custom_fields WHERE ticket_id = ?').run(id);
    db.prepare('DELETE FROM ticket_attachments WHERE ticket_id = ?').run(id);
    db.prepare('DELETE FROM ticket_comments   WHERE ticket_id = ?').run(id);
    db.prepare('DELETE FROM ticket_activity   WHERE ticket_id = ?').run(id);
    db.prepare('DELETE FROM tickets           WHERE id = ?').run(id);

    res.json({ success: true });
  } catch (e) { return handleError(res, e); }
});

// ── POST /api/tickets/:id/comments ────────────────────────────────────────────
router.post('/:id/comments', async (req, res) => {
  const { body, is_public } = req.body;
  const author      = req.user?.name || req.user?.email || 'Agent';
  const author_role = req.user?.role || 'agent';
  if (!body) return res.status(400).json({ error: 'Comment body is required' });
  let isPublic = (is_public === false || is_public === 0) ? 0 : 1;
  const ticketId = Number(req.params.id);

  if (req.user?.role === 'customer') {
    const ticket = db.prepare('SELECT requester_email, customer_id FROM tickets WHERE id = ?').get(ticketId);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.requester_email !== req.user.email && ticket.customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    // Customers cannot create internal notes
    isPublic = 1;
  }

  const result = db.prepare(
    `INSERT INTO ticket_comments (ticket_id, author, author_role, body, is_public) VALUES (?, ?, ?, ?, ?)`
  ).run(ticketId, author || 'Agent', author_role || 'agent', body, isPublic);

  db.prepare('UPDATE tickets SET updated_at = ? WHERE id = ?').run(now(), ticketId);
  logActivity(ticketId, author || 'Agent', isPublic ? 'replied' : 'internal_note', null, null, null);

  const comment = db.prepare('SELECT * FROM ticket_comments WHERE id = ?').get(result.lastInsertRowid);

  // Parse @mentions from comment body and send emails to tagged agents/admins
  // Mention format: <span data-user-id="N" ...>@Name</span>
  (() => {
    try {
      const mentionRegex = /data-user-id="(\d+)"/g;
      const mentionedIds = new Set();
      let m;
      while ((m = mentionRegex.exec(body)) !== null) {
        mentionedIds.add(Number(m[1]));
      }
      if (mentionedIds.size === 0) return;
      const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
      const mentionedByName = author || 'Agent';
      const commentPreview  = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
      for (const uid of mentionedIds) {
        const mentionedUser = db.prepare('SELECT * FROM users WHERE id = ? AND role IN (\'admin\',\'agent\')').get(uid);
        if (!mentionedUser || !mentionedUser.email) continue;
        notify.notifyAgentMentioned(ticket, mentionedUser.email, mentionedUser.name, mentionedByName, commentPreview).catch(() => {});
      }
    } catch (e) { console.warn('Mention notification failed:', e.message); }
  })();

  // Email reply for public comments on email-sourced tickets
  if (isPublic) {
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
    if (ticket?.requester_email && ticket?.source === 'email') {
      (async () => {
        try {
          const graph = require('../services/graph');
          await graph.sendReply({
            to: ticket.requester_email,
            subject: ticket.title,
            textBody: body,
            htmlBody:
              `<p>${body.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</p>` +
              `<hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb">` +
              `<p style="font-size:12px;color:#6b7280">Ticket #${ticket.id} · Helyx Support</p>`,
            inReplyTo:  ticket.email_message_id,
            references: ticket.email_message_id,
          });
        } catch (e) { console.warn(`⚠️  Email reply failed: ${e.message}`); }
      })();
    }
  }

  res.status(201).json(comment);
});

// ── POST /api/tickets/:id/attachments ─────────────────────────────────────────
router.post('/:id/attachments', uploadAttach.array('files', 10), (req, res) => {
  const ticketId = Number(req.params.id);
  // Verify ticket exists (M5)
  const ticket = db.prepare('SELECT id FROM tickets WHERE id = ?').get(ticketId);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  const commentId = req.body.comment_id ? Number(req.body.comment_id) : null;
  // Use authenticated user identity — never trust body for uploaded_by (H1)
  const uploadedBy = req.user?.email || req.user?.name || 'Agent';
  try {
    const inserted = [];
    for (const file of req.files || []) {
      const result = db.prepare(`
        INSERT INTO ticket_attachments (ticket_id, comment_id, display_name, filename, original_name, mimetype, size, uploaded_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(ticketId, commentId, file.originalname, file.filename, file.originalname, file.mimetype, file.size, uploadedBy, now());
      inserted.push(db.prepare('SELECT * FROM ticket_attachments WHERE id = ?').get(result.lastInsertRowid));
    }
    logActivity(ticketId, uploadedBy, 'attachment_added', null, null, `${inserted.length} file(s)`);
    res.status(201).json(inserted);
  } catch (e) { return handleError(res, e); }
});



// ── POST /api/tickets/:id/merge ───────────────────────────────────────────────
// Merge source ticket into target (this ticket keeps its identity).
// All comments, attachments, tags, and custom field values from source are
// copied into target. Source ticket is then closed with a merge note.
router.post('/:id/merge', (req, res) => {
  // Only agents and admins may merge tickets
  if (!['agent', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Only staff may merge tickets' });
  }

  const targetId = Number(req.params.id);
  const { source_ticket_id } = req.body;

  if (!source_ticket_id) return res.status(400).json({ error: 'source_ticket_id is required' });
  const sourceId = Number(source_ticket_id);
  if (sourceId === targetId) return res.status(400).json({ error: 'Cannot merge a ticket into itself' });

  const target = db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(targetId);
  if (!target) return res.status(404).json({ error: 'Target ticket not found' });
  const source = db.prepare('SELECT * FROM tickets WHERE id = ?').get(sourceId);
  if (!source) return res.status(404).json({ error: 'Source ticket not found' });

  try {
    const actor = req.user?.name || req.user?.email || 'Agent';
    const ts = now();

    // 1. Copy comments from source → target
    const sourceComments = db.prepare('SELECT * FROM ticket_comments WHERE ticket_id = ?').all(sourceId);
    for (const c of sourceComments) {
      db.prepare(`INSERT INTO ticket_comments (ticket_id, author, author_role, body, is_public, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run(targetId, c.author, c.author_role || 'agent', c.body, c.is_public, c.created_at);
    }

    // 2. Re-attach attachments from source → target
    db.prepare('UPDATE ticket_attachments SET ticket_id = ? WHERE ticket_id = ?').run(targetId, sourceId);

    // 3. Copy tags from source → target (ignore duplicates)
    const sourceTags = db.prepare('SELECT tag FROM ticket_tags WHERE ticket_id = ?').all(sourceId);
    for (const { tag } of sourceTags) {
      db.prepare('INSERT OR IGNORE INTO ticket_tags (ticket_id, tag) VALUES (?, ?)').run(targetId, tag);
    }

    // 4. Copy custom field values from source → target (target values win on conflict)
    const sourceCustomFields = db.prepare('SELECT * FROM ticket_custom_fields WHERE ticket_id = ?').all(sourceId);
    for (const cf of sourceCustomFields) {
      db.prepare(`INSERT OR IGNORE INTO ticket_custom_fields (ticket_id, field_id, value) VALUES (?, ?, ?)`)
        .run(targetId, cf.field_id, cf.value);
    }

    // Clear merged-away data from source (keeps source clean after closure)
    db.prepare('DELETE FROM ticket_tags          WHERE ticket_id = ?').run(sourceId);
    db.prepare('DELETE FROM ticket_custom_fields WHERE ticket_id = ?').run(sourceId);

    // 5. Add merge note on target
    db.prepare(`INSERT INTO ticket_comments (ticket_id, author, author_role, body, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(targetId, actor, 'agent', `<em>🔀 Ticket #${sourceId} was merged into this ticket by ${actor}. Subject: "${source.title}"</em>`, 0, ts);

    // 6. Close source ticket with merge note
    db.prepare(`UPDATE tickets SET status = 'Closed', updated_at = ? WHERE id = ?`).run(ts, sourceId);
    db.prepare(`INSERT INTO ticket_comments (ticket_id, author, author_role, body, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(sourceId, actor, 'agent', `<em>🔀 This ticket was merged into Ticket #${targetId} by ${actor}.</em>`, 0, ts);

    // 7. Log activity on both
    logActivity(targetId, actor, 'merged', null, null, `Merged from #${sourceId}`);
    logActivity(sourceId, actor, 'merged', null, null, `Merged into #${targetId}`);

    // 8. Update target timestamp
    db.prepare('UPDATE tickets SET updated_at = ? WHERE id = ?').run(ts, targetId);

    const updatedTarget = db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(targetId);
    res.json(updatedTarget);
  } catch (e) { return handleError(res, e); }
});

module.exports = router;
