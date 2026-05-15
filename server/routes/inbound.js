/**
 * inbound.js — Microsoft Graph change-notification webhook
 *
 * Two endpoints:
 *
 *  GET  /api/inbound/email?validationToken=xyz
 *    → Graph calls this once when you register a subscription.
 *      Must respond 200 with the token as plain text within 10 s.
 *
 *  POST /api/inbound/email
 *    → Graph calls this whenever a new email arrives in the support inbox.
 *      Must respond 202 immediately (Graph retries if it doesn't).
 *      We do the heavy work asynchronously after sending the 202.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const graph   = require('../services/graph');
const notify  = require('../services/emailNotifications');
const path    = require('path');
const fs      = require('fs');

const ATTACH_DIR = path.join(__dirname, '..', 'uploads', 'ticket_attachments');
fs.mkdirSync(ATTACH_DIR, { recursive: true });

function stripHtml(html = '') {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Fetch attachments from Graph and persist them to disk + ticket_attachments table.
 * @param {string} messageId  - Graph message ID
 * @param {number} ticketId   - DB ticket ID
 * @param {number|null} commentId - DB comment ID (null if attached to ticket directly)
 * @param {string} uploadedBy - Email of requester / sender
 */
async function saveEmailAttachments(messageId, ticketId, commentId, uploadedBy) {
  try {
    const attachments = await graph.getMessageAttachments(messageId);
    if (!attachments.length) return;

    const ts = new Date().toISOString();
    for (const att of attachments) {
      // Decode base64 content and write to disk
      const buffer   = Buffer.from(att.contentBytes, 'base64');
      const ext      = path.extname(att.name) || '';
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const filepath = path.join(ATTACH_DIR, filename);
      fs.writeFileSync(filepath, buffer);

      db.prepare(`
        INSERT INTO ticket_attachments
          (ticket_id, comment_id, display_name, filename, original_name, mimetype, size, uploaded_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ticketId,
        commentId || null,
        att.name,
        filename,
        att.name,
        att.contentType || 'application/octet-stream',
        att.size || buffer.length,
        uploadedBy || null,
        ts,
      );

      console.log(`📎  Saved email attachment: ${att.name} → ticket #${ticketId}`);
    }
  } catch (e) {
    console.warn(`⚠️  Failed to save email attachments for ticket #${ticketId}: ${e.message}`);
  }
}

// ── Validation handshake (one-time, on subscription creation) ─────────────────
router.get('/email', (req, res) => {
  const { validationToken } = req.query;
  if (validationToken) {
    return res.status(200).type('text/plain').send(validationToken);
  }
  res.status(400).send('Missing validationToken');
});

// ── Inbound notification ──────────────────────────────────────────────────────
router.post('/email', async (req, res) => {
  // Respond 202 immediately — Graph requires a fast acknowledgement
  res.status(202).send();

  const notifications = req.body?.value || [];

  for (const notification of notifications) {

    // Verify this notification came from our subscription
    if (notification.clientState !== graph.WEBHOOK_SECRET) {
      console.warn('⚠️  Inbound: clientState mismatch — ignoring notification');
      continue;
    }

    const messageId = notification.resourceData?.id;
    if (!messageId) continue;

    try {
      // Fetch the full message from Graph
      const msg = await graph.getMessage(messageId);
      if (!msg) continue;

      const from       = msg.from?.emailAddress?.address?.toLowerCase().trim() || '';
      const fromName   = msg.from?.emailAddress?.name || from;
      const subject    = (msg.subject || 'No Subject').trim();
      const bodyText   = msg.bodyPreview || stripHtml(msg.body?.content || '');
      const msgId      = msg.internetMessageId || null; // e.g. <abc123@mail.example.com>

      if (!from) {
        console.warn('⚠️  Inbound: email has no sender — skipping');
        continue;
      }

      // ── De-duplicate: skip if this Message-ID already exists ──────────────
      if (msgId) {
        const existing = db.prepare(
          `SELECT id FROM tickets WHERE email_message_id = ?`
        ).get(msgId);
        if (existing) {
          console.log(`📧  Inbound: duplicate message-id ${msgId} — skipping`);
          continue;
        }
      }

      // ── Check if this is a reply to an existing ticket ────────────────────
      // Look at In-Reply-To header to see if we should thread it as a comment
      // rather than a new ticket
      const headers     = msg.internetMessageHeaders || [];
      const inReplyTo   = headers.find((h) => h.name.toLowerCase() === 'in-reply-to')?.value || null;

      if (inReplyTo) {
        const parentTicket = db.prepare(
          `SELECT * FROM tickets WHERE email_message_id = ?`
        ).get(inReplyTo);

        if (parentTicket) {
          // Add as a comment on the existing ticket
          const ts = new Date().toISOString();
          const cmtResult = db.prepare(`
            INSERT INTO ticket_comments (ticket_id, author, author_role, body, is_public, created_at)
            VALUES (?, ?, 'customer', ?, 1, ?)
          `).run(parentTicket.id, fromName, bodyText, ts);

          db.prepare(`UPDATE tickets SET updated_at = ? WHERE id = ?`).run(ts, parentTicket.id);
          console.log(`📧  Inbound: customer reply threaded onto ticket #${parentTicket.id}`);

          // Save any attachments from the reply
          if (msg.hasAttachments) {
            saveEmailAttachments(messageId, parentTicket.id, cmtResult.lastInsertRowid, from);
          }
          continue;
        }
      }

      // ── Auto-detect or create customer record ─────────────────────────────
      // Try to match existing customer by domain (optional nice-to-have)
      let customerId = null;
      const domain = from.split('@')[1] || '';
      if (domain) {
        const customer = db.prepare(
          `SELECT id FROM customers WHERE LOWER(name) = LOWER(?)`
        ).get(domain.split('.')[0]); // e.g. "electra" from "electra.com"
        if (customer) customerId = customer.id;
      }

      // ── Create ticket ─────────────────────────────────────────────────────
      const ts = new Date().toISOString();
      const result = db.prepare(`
        INSERT INTO tickets
          (title, description, requester_email, source, status, priority, type,
           email_message_id, customer_id, created_at, updated_at)
        VALUES (?, ?, ?, 'email', 'Open', 'Medium', 'Question / How-To', ?, ?, ?, ?)
      `).run(subject, bodyText || null, from, msgId, customerId, ts, ts);

      const ticketId = result.lastInsertRowid;
      console.log(`📧  Inbound: ticket #${ticketId} created from ${from} — "${subject}"`);

      // ── Save any attachments from the original email ──────────────────────
      if (msg.hasAttachments) {
        saveEmailAttachments(messageId, ticketId, null, from);
      }

      // ── Notify Helyx Support group members via email template ────────────
      // Fire-and-forget — don't let email failure block ticket creation
      (async () => {
        try {
          // Find the "Helyx Support" group
          const group = db.prepare(
            `SELECT id FROM "groups" WHERE LOWER(name) = 'helyx support' AND active = 1 LIMIT 1`
          ).get();

          if (!group) {
            console.warn('⚠️  Inbound: "Helyx Support" group not found — skipping agent notification');
            return;
          }

          // Get all active members of that group
          const agents = db.prepare(`
            SELECT u.email, u.name
            FROM users u
            JOIN group_members gm ON gm.user_id = u.id
            WHERE gm.group_id = ? AND u.active = 1
          `).all(group.id);

          if (agents.length === 0) {
            console.warn('⚠️  Inbound: "Helyx Support" group has no active members — skipping notification');
            return;
          }

          const agentEmails = agents.map((a) => a.email);
          const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
          await notify.notifyNewTicketFromEmail(ticket, agentEmails);

          console.log(`📨  Notified ${agentEmails.length} agent(s) in Helyx Support: ${agentEmails.join(', ')}`);
        } catch (e) {
          console.warn(`⚠️  Agent notification failed: ${e.message}`);
        }
      })();

    } catch (e) {
      console.error('⚠️  Inbound: error processing notification:', e.message);
    }
  }
});

module.exports = router;
