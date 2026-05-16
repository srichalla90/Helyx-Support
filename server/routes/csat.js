/**
 * csat.js — CSAT (Customer Satisfaction) survey routes
 *
 * Mounted at /api/csat (no global requireAuth — mixed public/protected routes).
 *
 * Protected routes use requireAuth middleware per-route.
 * Public routes (rating submission) require only a valid token.
 */

const express  = require('express');
const crypto   = require('crypto');
const router   = express.Router();
const db       = require('../db');
const graph    = require('../services/graph');
const requireAuth = require('../middleware/requireAuth');
const handleError   = require('../middleware/handleError');

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '';
}

function substituteVars(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}

function buildBaseUrl(req) {
  const portalUrl = getSetting('portal_url');
  if (portalUrl) return portalUrl.replace(/\/$/, '');
  if (req.headers.origin) return req.headers.origin.replace(/\/$/, '');
  return (process.env.WEBHOOK_BASE_URL || '').replace(/\/$/, '');
}

function thankYouPage(rating) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Thank You for Your Feedback</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #f5f7fa;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      max-width: 480px;
      width: 100%;
      padding: 48px 40px;
      text-align: center;
    }
    .icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1a1a2e;
      margin-bottom: 0.75rem;
    }
    p {
      font-size: 1rem;
      color: #4a5568;
      line-height: 1.6;
    }
    .rating-badge {
      display: inline-block;
      margin-top: 1.25rem;
      background: #edf2ff;
      color: #3b5bdb;
      font-size: 1.125rem;
      font-weight: 700;
      padding: 0.4rem 1.25rem;
      border-radius: 999px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#127881;</div>
    <h1>Thank you for your feedback!</h1>
    <p>Your response helps us improve our support experience.</p>
    <div class="rating-badge">You rated your experience ${rating}/5</div>
  </div>
</body>
</html>`;
}

function alreadyRatedPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Already Submitted</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #f5f7fa;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      max-width: 480px;
      width: 100%;
      padding: 48px 40px;
      text-align: center;
    }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; font-weight: 700; color: #1a1a2e; margin-bottom: 0.75rem; }
    p  { font-size: 1rem; color: #4a5568; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10003;</div>
    <h1>Already submitted</h1>
    <p>We already have your feedback for this ticket. Thank you!</p>
  </div>
</body>
</html>`;
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /api/csat/send/:ticketId  (protected)
 * Send a CSAT survey email to the ticket requester.
 */
router.post('/send/:ticketId', requireAuth, async (req, res) => {
  const { ticketId } = req.params;

  // 1. Verify ticket exists and has a requester email
  const ticket = db.prepare('SELECT id, title, requester_email, status FROM tickets WHERE id = ?').get(ticketId);
  if (!ticket) {
    return res.status(404).json({ success: false, error: 'Ticket not found' });
  }
  if (!ticket.requester_email) {
    return res.status(400).json({ success: false, error: 'Ticket has no requester email' });
  }
  if (!['Resolved', 'Closed'].includes(ticket.status)) {
    return res.status(400).json({ error: 'CSAT surveys can only be sent for Resolved or Closed tickets' });
  }

  // 2. Check if survey was already sent for this ticket
  const existing = db
    .prepare('SELECT * FROM csat_ratings WHERE ticket_id = ? AND sent_at IS NOT NULL')
    .get(ticketId);
  if (existing) {
    return res.status(409).json({ success: false, error: 'Survey already sent', existing });
  }

  // 3. Generate a unique token
  const token = crypto.randomBytes(32).toString('hex');

  // 4. Build rating URLs
  const baseUrl = buildBaseUrl(req);
  const companyName = getSetting('company_name') || getSetting('site_name') || 'Support Team';

  const vars = {
    ticket_id:    String(ticket.id),
    ticket_title: ticket.title || `Ticket #${ticket.id}`,
    company_name: companyName,
  };
  for (let n = 1; n <= 5; n++) {
    vars[`rating_url_${n}`] = `${baseUrl}/csat/${token}/rate/${n}`;
  }

  // 5. Load and substitute the email template
  const tmpl = db
    .prepare("SELECT subject, body, enabled FROM email_templates WHERE key = 'csat_survey'")
    .get();

  let subject = `How was your support experience? (Ticket #${ticket.id})`;
  let body    = `<p>Hi,</p>
<p>We'd love to hear about your recent support experience for ticket: <strong>${vars.ticket_title}</strong>.</p>
<p>Please rate your experience:</p>
<p>
  <a href="${vars.rating_url_1}">1 - Very Poor</a> |
  <a href="${vars.rating_url_2}">2 - Poor</a> |
  <a href="${vars.rating_url_3}">3 - Neutral</a> |
  <a href="${vars.rating_url_4}">4 - Good</a> |
  <a href="${vars.rating_url_5}">5 - Excellent</a>
</p>
<p>Thank you,<br>${companyName}</p>`;

  if (tmpl && tmpl.enabled) {
    subject = substituteVars(tmpl.subject || subject, vars);
    body    = substituteVars(tmpl.body    || body,    vars);
  }

  // 6. Insert record into csat_ratings (before email attempt so the record always exists)
  const sentAt = new Date().toISOString();
  db.prepare(
    'INSERT INTO csat_ratings (ticket_id, token, sent_at) VALUES (?, ?, ?)'
  ).run(ticketId, token, sentAt);

  // 7. Attempt to send email via Microsoft Graph
  try {
    if (graph.isConfigured && graph.isConfigured()) {
      await graph.sendNotification({
        to:       [ticket.requester_email],
        subject,
        htmlBody: body,
      });
    } else {
      console.warn('[CSAT] Graph not configured — survey email not sent for ticket', ticketId);
    }
  } catch (emailErr) {
    console.error('[CSAT] Failed to send survey email for ticket', ticketId, ':', emailErr.message);
    // We still return success — the DB record was inserted and the token is valid
  }

  return res.json({ success: true, token });
});

/**
 * GET /api/csat/ticket/:ticketId  (protected)
 * Get the CSAT rating record for a specific ticket.
 */
router.get('/ticket/:ticketId', requireAuth, (req, res) => {
  const { ticketId } = req.params;
  const row = db.prepare('SELECT * FROM csat_ratings WHERE ticket_id = ?').get(ticketId);
  return res.json({ rating: row || null });
});

/**
 * GET /api/csat/stats  (protected)
 * Aggregate CSAT statistics.
 */
router.get('/stats', requireAuth, (req, res) => {
  const totalSent = db
    .prepare('SELECT COUNT(*) AS cnt FROM csat_ratings WHERE sent_at IS NOT NULL')
    .get().cnt;

  const totalSubmitted = db
    .prepare('SELECT COUNT(*) AS cnt FROM csat_ratings WHERE submitted_at IS NOT NULL')
    .get().cnt;

  const avgRow = db
    .prepare('SELECT AVG(CAST(rating AS REAL)) AS avg FROM csat_ratings WHERE rating IS NOT NULL')
    .get();
  const avgRating = avgRow && avgRow.avg !== null ? Math.round(avgRow.avg * 100) / 100 : null;

  const byRating = db
    .prepare(
      `SELECT rating, COUNT(*) AS count
       FROM csat_ratings
       WHERE rating IS NOT NULL
       GROUP BY rating
       ORDER BY rating ASC`
    )
    .all();

  return res.json({
    total_sent:      totalSent,
    total_submitted: totalSubmitted,
    avg_rating:      avgRating,
    by_rating:       byRating,
  });
});

/**
 * GET /api/csat/rate/:token/:rating  (PUBLIC)
 * One-click rating link from the survey email.
 * Validates token and rating, records the response, shows a thank-you page.
 */
router.get('/rate/:token/:rating', (req, res) => {
  const { token } = req.params;
  const ratingNum = parseInt(req.params.rating, 10);

  if (!token || isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).send('<p>Invalid rating link.</p>');
  }

  const row = db.prepare('SELECT * FROM csat_ratings WHERE token = ?').get(token);
  if (!row) {
    return res.status(404).send('<p>Survey link not found or expired.</p>');
  }

  // Already submitted
  if (row.submitted_at) {
    return res.send(alreadyRatedPage());
  }

  const submittedAt = new Date().toISOString();
  db.prepare(
    'UPDATE csat_ratings SET rating = ?, submitted_at = ? WHERE token = ?'
  ).run(ratingNum, submittedAt, token);

  return res.send(thankYouPage(ratingNum));
});

/**
 * POST /api/csat/rate/:token  (PUBLIC)
 * Submit rating + optional comment via POST (form or JSON).
 */
router.post('/rate/:token', (req, res) => {
  const { token } = req.params;
  const { rating, comment } = req.body || {};

  const ratingNum = parseInt(rating, 10);
  if (!token || isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ success: false, error: 'Invalid token or rating (must be 1–5)' });
  }

  const row = db.prepare('SELECT * FROM csat_ratings WHERE token = ?').get(token);
  if (!row) {
    return res.status(404).json({ success: false, error: 'Survey link not found or expired' });
  }

  if (row.submitted_at) {
    return res.status(409).json({ success: false, error: 'Survey already submitted' });
  }

  const submittedAt = new Date().toISOString();
  db.prepare(
    'UPDATE csat_ratings SET rating = ?, comment = ?, submitted_at = ? WHERE token = ?'
  ).run(ratingNum, comment || null, submittedAt, token);

  return res.json({ success: true });
});

module.exports = router;
