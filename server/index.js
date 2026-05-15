// Load .env before anything else
try { require('dotenv').config(); } catch (_) {}

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const db       = require('./db');

const ticketsRouter      = require('./routes/tickets');
const groupsRouter       = require('./routes/groups');
const usersRouter        = require('./routes/users');
const customersRouter    = require('./routes/customers');
const emailRouter        = require('./routes/email');
const authRouter         = require('./routes/auth');
const inboundRouter      = require('./routes/inbound');
const kbRouter            = require('./routes/kb');
const announcementsRouter = require('./routes/announcements');
const featuresRouter      = require('./routes/features');
const settingsRouter      = require('./routes/settings');
const emailTemplatesRouter = require('./routes/emailTemplates');
const cannedResponsesRouter = require('./routes/cannedResponses');
const csatRouter            = require('./routes/csat');
const slaRouter             = require('./routes/sla');
const automationRouter      = require('./routes/automation');
const customFieldsRouter    = require('./routes/customFields');
const subscriptionManager = require('./services/subscriptionManager');
const requireAuth         = require('./middleware/requireAuth');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── API ───────────────────────────────────────────────────────────────────────
// Public routes (no auth required)
app.use('/api/auth',    authRouter);    // login/azure exchange
app.use('/api/inbound', inboundRouter); // Microsoft Graph webhook (validates its own secret)

// Protected routes — all require a valid Bearer token
app.use('/api/tickets',       requireAuth, ticketsRouter);
app.use('/api/groups',        requireAuth, groupsRouter);
app.use('/api/users',         requireAuth, usersRouter);
app.use('/api/customers',     requireAuth, customersRouter);
app.use('/api/email',         requireAuth, emailRouter);
app.use('/api/kb',            requireAuth, kbRouter);
app.use('/api/announcements', requireAuth, announcementsRouter);
app.use('/api/features',      requireAuth, featuresRouter);
app.use('/api/settings',        requireAuth, settingsRouter);
app.use('/api/email-templates',  requireAuth, emailTemplatesRouter);
app.use('/api/canned-responses', requireAuth, cannedResponsesRouter);
app.use('/api/csat',             csatRouter);          // has both public + protected sub-routes
app.use('/api/sla',              requireAuth, slaRouter);
app.use('/api/automation',       requireAuth, automationRouter);
app.use('/api/custom-fields',    requireAuth, customFieldsRouter);

app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.get('/api/stats', requireAuth, (req, res) => {
  try {
    const stats = {
      total:       db.prepare('SELECT COUNT(*) AS n FROM tickets').get().n,
      open:        db.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE status = 'Open'`).get().n,
      pending:     db.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE status IN ('Pending','In Investigation','Pending Engineering','Waiting on Customer','Pending Release')`).get().n,
      resolved:    db.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE status IN ('Resolved','Closed')`).get().n,
      critical:    db.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE priority = 'Critical' AND status NOT IN ('Resolved','Closed','Canceled')`).get().n,
      by_status:   db.prepare('SELECT status, COUNT(*) AS n FROM tickets GROUP BY status').all(),
      by_priority: db.prepare('SELECT priority, COUNT(*) AS n FROM tickets GROUP BY priority').all(),
      by_product:  db.prepare(`SELECT COALESCE(product,'Unassigned') AS product, COUNT(*) AS n FROM tickets GROUP BY product`).all(),
    };
    res.json(stats);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Serve React build in production ──────────────────────────────────────────
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/(.*)/, (req, res) => {
  const index = path.join(clientDist, 'index.html');
  res.sendFile(index, (err) => {
    if (err) res.status(200).send('Helyx Support API is running.');
  });
});

// ── Wait for DB then start ────────────────────────────────────────────────────
db.ready.then(() => {
  app.listen(PORT, () => {
    console.log(`\n🟢  Helyx Support API  →  http://localhost:${PORT}`);
    console.log(`    Email ingest:  POST http://localhost:${PORT}/api/email/ingest`);
    console.log(`    Graph webhook: POST http://localhost:${PORT}/api/inbound/email`);
    console.log(`    Health:        GET  http://localhost:${PORT}/api/health\n`);
  });

  // Start Microsoft Graph subscription manager (gracefully no-ops if credentials not set)
  subscriptionManager.start();
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
