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

function stripHtml(html = '') {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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
          db.prepare(`
            INSERT INTO ticket_comments (ticket_id, author, body, is_public, created_at)
            VALUES (?, ?, ?, 1, ?)
          `).run(parentTicket.id, fromName, bodyText, ts);

          db.prepare(`UPDATE tickets SET updated_at = ? WHERE id = ?`).run(ts, parentTicket.id);
          console.log(`📧  Inbound: customer reply threaded onto ticket #${parentTicket.id}`);
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

      // ── Notify Helyx Support group members ───────────────────────────────
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
          const preview     = (bodyText || '').slice(0, 300).trim();
          const appUrl      = process.env.WEBHOOK_BASE_URL || '';

          const htmlBody =
            `<div style="font-family:Arial,sans-serif;max-width:600px;color:#111827">` +
            `<div style="background:#1D4ED8;padding:16px 24px;border-radius:8px 8px 0 0">` +
            `<h2 style="color:#fff;margin:0;font-size:18px">New Support Ticket #${ticketId}</h2>` +
            `</div>` +
            `<div style="border:1px solid #E5E7EB;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px">` +
            `<table style="width:100%;border-collapse:collapse;margin-bottom:16px">` +
            `<tr><td style="padding:6px 0;color:#6B7280;font-size:13px;width:110px">From</td>` +
            `<td style="padding:6px 0;font-size:13px"><strong>${from}</strong></td></tr>` +
            `<tr><td style="padding:6px 0;color:#6B7280;font-size:13px">Subject</td>` +
            `<td style="padding:6px 0;font-size:13px"><strong>${subject.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</strong></td></tr>` +
            `</table>` +
            (preview
              ? `<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:12px 16px;font-size:13px;color:#374151;margin-bottom:20px">${preview.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>`
              : '') +
            (appUrl && !appUrl.includes('YOUR_SERVER')
              ? `<a href="${appUrl}" style="display:inline-block;background:#1D4ED8;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">View Ticket #${ticketId}</a>`
              : '') +
            `</div></div>`;

          await graph.sendNotification({
            to:      agentEmails,
            subject: `[New Ticket #${ticketId}] ${subject}`,
            htmlBody,
          });

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
