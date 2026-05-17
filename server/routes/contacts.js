/**
 * contacts.js — Unified contacts directory
 *
 *  GET /api/contacts
 *    Returns every person the system knows about, merged into one list:
 *      1. Users (agents / admins / customer-role)          source: 'user'
 *      2. Customer contact entries (customers.contacts[])  source: 'customer_contact'
 *      3. Ticket requesters with no user account           source: 'requester'
 *
 *  Each record:
 *    { id, email, name, type, source, company, customer_id, ticket_count, last_ticket_at, active }
 *
 *  type values: 'admin' | 'agent' | 'customer' | 'contact' | 'requester'
 */

const express     = require('express');
const router      = express.Router();
const db          = require('../db');
const handleError = require('../middleware/handleError');
const staffOnly   = require('../middleware/staffOnly');

router.get('/', staffOnly, (req, res) => {
  try {
    // ── 1. All users ─────────────────────────────────────────────────────────
    const users = db.prepare(`
      SELECT
        'user-' || u.id           AS id,
        u.id                      AS user_id,
        u.email,
        u.name,
        u.role                    AS type,
        'user'                    AS source,
        u.active,
        NULL                      AS customer_id,
        NULL                      AS company,
        NULL                      AS job_title,
        COUNT(t.id)               AS ticket_count,
        MAX(t.created_at)         AS last_ticket_at
      FROM users u
      LEFT JOIN tickets t ON LOWER(t.requester_email) = LOWER(u.email)
      GROUP BY u.id
      ORDER BY u.name ASC
    `).all();

    // Build a set of known emails (from users) for deduplication
    const knownEmails = new Set(users.map((u) => u.email.toLowerCase()));

    // ── 2. Customer contact entries ───────────────────────────────────────────
    // customers.contacts is a JSON array of { name, email, title, phone }
    const customers = db.prepare(
      `SELECT id, name, contacts FROM customers WHERE active = 1`
    ).all();

    const customerContacts = [];
    for (const cust of customers) {
      let contactList = [];
      try { contactList = JSON.parse(cust.contacts || '[]'); } catch (_) {}
      for (const c of contactList) {
        if (!c.email) continue;
        const email = c.email.toLowerCase();
        if (knownEmails.has(email)) continue; // already in users
        knownEmails.add(email);

        // Count tickets for this email
        const stats = db.prepare(
          `SELECT COUNT(*) AS cnt, MAX(created_at) AS last_at FROM tickets WHERE LOWER(requester_email) = ?`
        ).get(email);

        customerContacts.push({
          id:             `contact-${cust.id}-${email}`,
          user_id:        null,
          email:          c.email,
          name:           c.name  || c.email,
          type:           'contact',
          source:         'customer_contact',
          active:         1,
          customer_id:    cust.id,
          company:        cust.name,
          job_title:      c.title || null,
          ticket_count:   stats?.cnt  || 0,
          last_ticket_at: stats?.last_at || null,
        });
      }
    }

    // ── 3. Ticket requesters with no account ──────────────────────────────────
    const requesters = db.prepare(`
      SELECT
        requester_email,
        COUNT(*)     AS ticket_count,
        MAX(created_at) AS last_ticket_at
      FROM tickets
      WHERE requester_email IS NOT NULL AND requester_email != ''
      GROUP BY LOWER(requester_email)
    `).all();

    const unregistered = [];
    for (const r of requesters) {
      const email = r.requester_email.toLowerCase();
      if (knownEmails.has(email)) continue;
      knownEmails.add(email);
      unregistered.push({
        id:             `requester-${email}`,
        user_id:        null,
        email:          r.requester_email,
        name:           r.requester_email, // no name — just email
        type:           'requester',
        source:         'requester',
        active:         1,
        customer_id:    null,
        company:        null,
        job_title:      null,
        ticket_count:   r.ticket_count,
        last_ticket_at: r.last_ticket_at,
      });
    }

    // ── Merge and attach company to users via ticket→customer ─────────────────
    // For user records, try to find their associated customer from tickets
    const userFull = users.map((u) => {
      const customerRow = db.prepare(`
        SELECT c.id, c.name FROM customers c
        INNER JOIN tickets t ON t.customer_id = c.id
        WHERE LOWER(t.requester_email) = LOWER(?)
        LIMIT 1
      `).get(u.email);
      return {
        ...u,
        company:     customerRow?.name  || null,
        customer_id: customerRow?.id    || null,
        job_title:   null,
      };
    });

    const all = [...userFull, ...customerContacts, ...unregistered];

    res.json(all);
  } catch (e) { return handleError(res, e); }
});

module.exports = router;
